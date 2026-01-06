import { decrypt } from '@/lib/crypto'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { providerCredentials, usageLog } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { v4 as uuidv4 } from 'uuid'
import {
  ReviewRequest,
  ReviewResult,
  ReviewIssue,
  REVIEW_PROMPTS,
  ReviewProvider
} from '@/lib/review/types'

// Parse LLM response into structured review
function parseReviewResponse(response: string, focus: string): {
  issues: ReviewIssue[]
  approvals: string[]
  learnedPatterns: string[]
} {
  const issues: ReviewIssue[] = []
  const approvals: string[] = []
  const learnedPatterns: string[] = []

  // Simple parsing - look for common patterns in the response
  const lines = response.split('\n')
  let currentSection: 'issues' | 'approvals' | 'patterns' | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const lower = trimmed.toLowerCase()

    // Detect sections
    if (lower.includes('issue') || lower.includes('problem') || lower.includes('concern') || lower.includes('warning') || lower.includes('error')) {
      currentSection = 'issues'
    } else if (lower.includes('good') || lower.includes('correct') || lower.includes('approved') || lower.includes('✓') || lower.includes('looks good')) {
      currentSection = 'approvals'
    } else if (lower.includes('pattern') || lower.includes('recommend') || lower.includes('suggestion') || lower.includes('should always')) {
      currentSection = 'patterns'
    }

    // Parse bullet points
    if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
      const content = trimmed.replace(/^[-•*\d.]+\s*/, '')

      if (currentSection === 'issues' && content.length > 10) {
        // Determine severity from content
        let severity: ReviewIssue['severity'] = 'warning'
        if (lower.includes('critical') || lower.includes('security') || lower.includes('vulnerability') || lower.includes('injection')) {
          severity = 'critical'
        } else if (lower.includes('suggest') || lower.includes('consider') || lower.includes('could')) {
          severity = 'suggestion'
        }

        issues.push({
          severity,
          category: focus,
          description: content
        })
      } else if (currentSection === 'approvals' && content.length > 5) {
        approvals.push(content)
      } else if (currentSection === 'patterns' && content.length > 10) {
        learnedPatterns.push(content)
      }
    }
  }

  // If no structured issues found, try to extract from prose
  if (issues.length === 0) {
    // Look for severity keywords anywhere
    if (response.toLowerCase().includes('no issues') ||
        response.toLowerCase().includes('looks good') ||
        response.toLowerCase().includes('no problems')) {
      approvals.push('Overall review passed with no significant issues')
    }
  }

  return { issues, approvals, learnedPatterns }
}

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
      response: responseToReview,
      responseProvider,
      projectContext,
      agentName,
      agentRole,
      focus,
      reviewProvider
    } = body

    // Get provider credentials
    const creds = await db.query.providerCredentials.findMany({
      where: and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.isActive, true)
      )
    })

    // Build provider configs (same logic as chat route)
    let providerConfigs: any[] = []
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
        costPer1M: c.costPer1M || { input: 0, output: 0 }
      }))
    }

    // Find the requested review provider
    const reviewConfig = providerConfigs.find(p => p.provider === reviewProvider)
    if (!reviewConfig) {
      return NextResponse.json(
        { error: `Review provider ${reviewProvider} not configured` },
        { status: 400 }
      )
    }

    // Build review prompt
    const reviewSystemPrompt = REVIEW_PROMPTS[focus]

    const reviewContent = `## Original Task
${originalTask}

## Response to Review (from ${responseProvider}${agentName ? `, ${agentName} agent` : ''})
${responseToReview}

${projectContext ? `## Project Context\n${projectContext}` : ''}

---

Please provide your review. Structure your response with:
1. **Issues Found** - List any problems, bugs, or concerns with severity (critical/warning/suggestion)
2. **What Looks Good** - List things that are correct or well-done
3. **Patterns to Remember** - Any lessons or patterns to apply in future work

Be specific and actionable.`

    let reviewResponse: string
    let tokensInput: number = 0
    let tokensOutput: number = 0

    try {
      if (reviewProvider === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: reviewConfig.apiKey })

        const result = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 2000,
          system: reviewSystemPrompt,
          messages: [{ role: 'user', content: reviewContent }]
        })

        reviewResponse = result.content[0].type === 'text' ? result.content[0].text : ''
        tokensInput = result.usage.input_tokens
        tokensOutput = result.usage.output_tokens

      } else if (reviewProvider === 'openai') {
        const openai = new OpenAI({ apiKey: reviewConfig.apiKey })

        const result = await openai.chat.completions.create({
          model: 'gpt-4-turbo',
          messages: [
            { role: 'system', content: reviewSystemPrompt },
            { role: 'user', content: reviewContent }
          ],
          max_tokens: 2000
        })

        reviewResponse = result.choices[0].message.content || ''
        tokensInput = result.usage?.prompt_tokens || 0
        tokensOutput = result.usage?.completion_tokens || 0

      } else {
        // Google
        const genAI = new GoogleGenerativeAI(reviewConfig.apiKey)
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-pro',
          systemInstruction: reviewSystemPrompt
        })

        const result = await model.generateContent(reviewContent)
        reviewResponse = result.response.text()
        tokensInput = result.response.usageMetadata?.promptTokenCount || 0
        tokensOutput = result.response.usageMetadata?.candidatesTokenCount || 0
      }
    } catch (err: any) {
      console.error('Review provider error:', err)
      return NextResponse.json(
        { error: `Review provider ${reviewProvider} failed: ${err.message}` },
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

    // Parse the review response
    const parsed = parseReviewResponse(reviewResponse, focus)

    // Determine overall assessment
    let overallAssessment: ReviewResult['overallAssessment'] = 'approved'
    if (parsed.issues.some(i => i.severity === 'critical')) {
      overallAssessment = 'critical-issues'
    } else if (parsed.issues.length > 0) {
      overallAssessment = 'needs-changes'
    }

    // Build result
    const result: ReviewResult = {
      id: uuidv4(),
      reviewedAt: new Date().toISOString(),
      reviewProvider,
      focus,
      issues: parsed.issues,
      approvals: parsed.approvals,
      overallAssessment,
      confidence: parsed.issues.length > 0 || parsed.approvals.length > 0 ? 'high' : 'medium',
      summary: reviewResponse,
      learnedPatterns: parsed.learnedPatterns,
      costUsd: actualCost
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Review error:', error)
    return NextResponse.json(
      { error: `Failed to process review: ${error.message}` },
      { status: 500 }
    )
  }
}
