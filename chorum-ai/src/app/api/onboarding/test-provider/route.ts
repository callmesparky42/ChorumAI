import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { TestProviderRequest, ProviderTestResult } from '@/lib/onboarding/types'

/**
 * POST /api/onboarding/test-provider
 *
 * Tests an LLM provider by making a minimal API call.
 * Returns success status, latency, and any errors.
 *
 * This validates API keys before storing them.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as TestProviderRequest
    const { provider, apiKey, model, baseUrl } = body

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    // Local providers don't need API key testing
    const isLocalProvider = ['ollama', 'lmstudio', 'openai-compatible'].includes(provider)
    if (isLocalProvider) {
      // Test local provider connection
      const result = await testLocalProvider(provider, baseUrl, model)
      return NextResponse.json(result)
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required for cloud providers' }, { status: 400 })
    }

    // Test cloud provider
    const startTime = performance.now()
    let result: ProviderTestResult

    switch (provider) {
      case 'anthropic':
        result = await testAnthropic(apiKey, model)
        break
      case 'openai':
        result = await testOpenAI(apiKey, model)
        break
      case 'google':
        result = await testGoogle(apiKey, model)
        break
      case 'perplexity':
        result = await testPerplexity(apiKey, model)
        break
      case 'deepseek':
        result = await testDeepSeek(apiKey, model)
        break
      default:
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    const endTime = performance.now()
    result.latencyMs = Math.round(endTime - startTime)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Test provider error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    const result: ProviderTestResult = {
      success: false,
      provider: 'unknown',
      error: errorMessage,
      details: 'Failed to test provider',
    }

    return NextResponse.json(result)
  }
}

async function testAnthropic(apiKey: string, model?: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = (error as { error?: { message?: string } })?.error?.message || response.statusText
      return {
        success: false,
        provider: 'anthropic',
        model: model || 'claude-sonnet-4-20250514',
        error: errorMsg,
        details: response.status === 401 ? 'Invalid API key' : `API error: ${response.status}`,
      }
    }

    return {
      success: true,
      provider: 'anthropic',
      model: model || 'claude-sonnet-4-20250514',
      details: 'API key validated successfully',
    }
  } catch (error) {
    return {
      success: false,
      provider: 'anthropic',
      error: error instanceof Error ? error.message : 'Connection failed',
      details: 'Failed to reach Anthropic API',
    }
  }
}

async function testOpenAI(apiKey: string, model?: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = (error as { error?: { message?: string } })?.error?.message || response.statusText
      return {
        success: false,
        provider: 'openai',
        model: model || 'gpt-4o-mini',
        error: errorMsg,
        details: response.status === 401 ? 'Invalid API key' : `API error: ${response.status}`,
      }
    }

    return {
      success: true,
      provider: 'openai',
      model: model || 'gpt-4o-mini',
      details: 'API key validated successfully',
    }
  } catch (error) {
    return {
      success: false,
      provider: 'openai',
      error: error instanceof Error ? error.message : 'Connection failed',
      details: 'Failed to reach OpenAI API',
    }
  }
}

async function testGoogle(apiKey: string, model?: string): Promise<ProviderTestResult> {
  const modelName = model || 'gemini-1.5-flash'
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "ok"' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = (error as { error?: { message?: string } })?.error?.message || response.statusText
      return {
        success: false,
        provider: 'google',
        model: modelName,
        error: errorMsg,
        details: response.status === 400 ? 'Invalid API key' : `API error: ${response.status}`,
      }
    }

    return {
      success: true,
      provider: 'google',
      model: modelName,
      details: 'API key validated successfully',
    }
  } catch (error) {
    return {
      success: false,
      provider: 'google',
      error: error instanceof Error ? error.message : 'Connection failed',
      details: 'Failed to reach Google AI API',
    }
  }
}

async function testPerplexity(apiKey: string, model?: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'llama-3.1-sonar-small-128k-online',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = (error as { error?: { message?: string } })?.error?.message || response.statusText
      return {
        success: false,
        provider: 'perplexity',
        model: model || 'llama-3.1-sonar-small-128k-online',
        error: errorMsg,
        details: response.status === 401 ? 'Invalid API key' : `API error: ${response.status}`,
      }
    }

    return {
      success: true,
      provider: 'perplexity',
      model: model || 'llama-3.1-sonar-small-128k-online',
      details: 'API key validated successfully',
    }
  } catch (error) {
    return {
      success: false,
      provider: 'perplexity',
      error: error instanceof Error ? error.message : 'Connection failed',
      details: 'Failed to reach Perplexity API',
    }
  }
}

async function testDeepSeek(apiKey: string, model?: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = (error as { error?: { message?: string } })?.error?.message || response.statusText
      return {
        success: false,
        provider: 'deepseek',
        model: model || 'deepseek-chat',
        error: errorMsg,
        details: response.status === 401 ? 'Invalid API key' : `API error: ${response.status}`,
      }
    }

    return {
      success: true,
      provider: 'deepseek',
      model: model || 'deepseek-chat',
      details: 'API key validated successfully',
    }
  } catch (error) {
    return {
      success: false,
      provider: 'deepseek',
      error: error instanceof Error ? error.message : 'Connection failed',
      details: 'Failed to reach DeepSeek API',
    }
  }
}

async function testLocalProvider(
  provider: string,
  baseUrl?: string,
  model?: string
): Promise<ProviderTestResult> {
  const defaultUrls: Record<string, string> = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234',
    'openai-compatible': baseUrl || 'http://localhost:8080',
  }

  const url = baseUrl || defaultUrls[provider]
  const startTime = performance.now()

  try {
    // For Ollama, check the /api/tags endpoint
    if (provider === 'ollama') {
      const response = await fetch(`${url}/api/tags`, { method: 'GET' })
      const endTime = performance.now()

      if (!response.ok) {
        return {
          success: false,
          provider,
          latencyMs: Math.round(endTime - startTime),
          error: `HTTP ${response.status}`,
          details: `Ollama server not responding at ${url}`,
        }
      }

      const data = (await response.json()) as { models?: { name: string }[] }
      const models = data.models?.map((m) => m.name) || []

      return {
        success: true,
        provider,
        model: model || (models[0] ?? 'unknown'),
        latencyMs: Math.round(endTime - startTime),
        details: `Connected. Available models: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''}`,
      }
    }

    // For LM Studio and OpenAI-compatible, check /v1/models
    const response = await fetch(`${url}/v1/models`, { method: 'GET' })
    const endTime = performance.now()

    if (!response.ok) {
      return {
        success: false,
        provider,
        latencyMs: Math.round(endTime - startTime),
        error: `HTTP ${response.status}`,
        details: `Server not responding at ${url}`,
      }
    }

    return {
      success: true,
      provider,
      model: model || 'local-model',
      latencyMs: Math.round(endTime - startTime),
      details: `Connected to ${url}`,
    }
  } catch (error) {
    const endTime = performance.now()
    const errorMsg = error instanceof Error ? error.message : 'Connection failed'

    let details = `Failed to connect to ${url}`
    if (errorMsg.includes('ECONNREFUSED')) {
      details = `${provider === 'ollama' ? 'Ollama' : 'Server'} is not running at ${url}`
    }

    return {
      success: false,
      provider,
      latencyMs: Math.round(endTime - startTime),
      error: errorMsg,
      details,
    }
  }
}
