import { decrypt } from '@/lib/crypto'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { providerCredentials, usageLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { v4 as uuidv4 } from 'uuid'
import {
  ReviewRequest,
  ReviewResult,
  ReviewProvider
} from '@/lib/review/types'
import { injectLearningContext } from '@/lib/learning'

// Simple peer review: resend the original prompt to a different provider
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const body: ReviewRequest = await req.json()
    const {
      originalTask,
      response: originalResponse,
      responseProvider,
      projectId,
      focus
    } = body

    // Get provider credentials
    const creds = await db.query.providerCredentials.findMany({
      where: and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.isActive, true)
      )
    })

    // Build provider configs
    let providerConfigs: { provider: string; apiKey: string; costPer1M: { input: number; output: number } }[] = []
    if (creds.length === 0) {
      // Use environment keys
      if (process.env.ANTHROPIC_API_KEY) {
        providerConfigs.push({
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          costPer1M: { input: 3, output: 15 }
        })
      }
      if (process.env.OPENAI_API_KEY) {
        providerConfigs.push({
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          costPer1M: { input: 10, output: 30 }
        })
      }
      if (process.env.GOOGLE_AI_API_KEY) {
        providerConfigs.push({
          provider: 'google',
          apiKey: process.env.GOOGLE_AI_API_KEY,
          costPer1M: { input: 3.5, output: 10.5 }
        })
      }
    } else {
      providerConfigs = creds.map(c => ({
        provider: c.provider,
        apiKey: decrypt(c.apiKeyEncrypted),
        costPer1M: (c.costPer1M as { input: number; output: number }) || { input: 0, output: 0 }
      }))
    }

    // Pick a different provider for the second opinion
    // Priority: if original was Anthropic, try OpenAI first, then Google
    // If original was OpenAI, try Anthropic first, then Google
    // If original was Google, try Anthropic first, then OpenAI
    const priorityOrder: Record<string, string[]> = {
      'anthropic': ['openai', 'google'],
      'openai': ['anthropic', 'google'],
      'google': ['anthropic', 'openai']
    }

    const preferredOrder = priorityOrder[responseProvider] || ['anthropic', 'openai', 'google']

    let reviewConfig = null
    for (const provider of preferredOrder) {
      reviewConfig = providerConfigs.find(p => p.provider === provider)
      if (reviewConfig) break
    }

    if (!reviewConfig) {
      return NextResponse.json(
        { error: 'No alternate provider available for second opinion. Add another provider in Settings.' },
        { status: 400 }
      )
    }

    const reviewProvider = reviewConfig.provider as ReviewProvider

    // Fetch project learning context if projectId is provided
    let projectContext = ''
    if (projectId) {
      try {
        // Use injectLearningContext with an empty base prompt - we just want the learning context
        const learningContext = await injectLearningContext('', projectId, originalTask, userId)
        // Extract the systemPrompt which contains the formatted learning context
        if (learningContext && learningContext.systemPrompt) {
          projectContext = `\n\n[Project Context]\n${learningContext.systemPrompt}`
        }
      } catch (e) {
        console.warn('[PeerReview] Failed to fetch project context:', e)
      }
    }

    // Build system prompt with project context
    const systemPrompt = `You are providing a second opinion. The user asked another AI this question and got an answer. Now they want YOUR perspective. Answer the question directly - don't just comment on the other response.${projectContext}`

    const userPrompt = `Original question: ${originalTask}

Please provide your answer to this question.`

    let reviewResponse: string
    let tokensInput: number = 0
    let tokensOutput: number = 0

    try {
      if (reviewProvider === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: reviewConfig.apiKey })

        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })

        reviewResponse = result.content[0].type === 'text' ? result.content[0].text : ''
        tokensInput = result.usage.input_tokens
        tokensOutput = result.usage.output_tokens

      } else if (reviewProvider === 'openai') {
        const openai = new OpenAI({ apiKey: reviewConfig.apiKey })

        const result = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 4096
        })

        reviewResponse = result.choices[0].message.content || ''
        tokensInput = result.usage?.prompt_tokens || 0
        tokensOutput = result.usage?.completion_tokens || 0

      } else {
        // Google
        const genAI = new GoogleGenerativeAI(reviewConfig.apiKey)
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-pro',
          systemInstruction: systemPrompt
        })

        const result = await model.generateContent(userPrompt)
        reviewResponse = result.response.text()
        tokensInput = result.response.usageMetadata?.promptTokenCount || 0
        tokensOutput = result.response.usageMetadata?.candidatesTokenCount || 0
      }
    } catch (err: any) {
      console.error('Review provider error:', err)
      return NextResponse.json(
        { error: `Second opinion failed (${reviewProvider}): ${err.message}` },
        { status: 500 }
      )
    }

    // Calculate cost
    const actualCost = (
      (tokensInput / 1_000_000 * reviewConfig.costPer1M.input) +
      (tokensOutput / 1_000_000 * reviewConfig.costPer1M.output)
    )

    // Log usage
    try {
      await db.insert(usageLog).values({
        userId,
        provider: reviewProvider,
        costUsd: actualCost.toString(),
        tokensInput,
        tokensOutput
      })
    } catch (e) {
      console.warn('Failed to log review usage:', e)
    }

    // Build simple result
    const result: ReviewResult = {
      id: uuidv4(),
      reviewedAt: new Date().toISOString(),
      reviewProvider,
      focus,
      issues: [],  // Simple mode: no issue parsing
      approvals: [],
      overallAssessment: 'approved',
      confidence: 'high',
      summary: reviewResponse,  // The full second opinion response
      learnedPatterns: [],
      costUsd: actualCost
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Review error:', error)
    return NextResponse.json(
      { error: `Failed to get second opinion: ${error.message}` },
      { status: 500 }
    )
  }
}

