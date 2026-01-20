import { callProvider } from '@/lib/providers'

interface TitleGeneratorConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
  isLocal?: boolean
}

/**
 * Generate a short, descriptive title for a conversation based on the first user message.
 * Uses a fast, cheap model call to create a 3-6 word title like modern chatbots do.
 */
export async function generateConversationTitle(
  userMessage: string,
  config: TitleGeneratorConfig
): Promise<string> {
  const systemPrompt = `You are a conversation title generator. Generate a very short, descriptive title (3-6 words) for a conversation based on the user's first message.
Rules:
- Be concise and specific
- Capture the main topic or intent
- Use title case
- Do NOT use quotes around the title
- Do NOT include phrases like "Help with" or "Question about"
- Just output the title, nothing else

Examples:
User: "How do I center a div in CSS?"
Title: Centering Divs in CSS

User: "Can you explain React hooks to me?"
Title: Understanding React Hooks

User: "I need to write a function that checks if a number is prime"
Title: Prime Number Checker Function

User: "What's the best way to handle authentication in Next.js?"
Title: Next.js Authentication Strategy`

  try {
    const result = await callProvider(
      {
        provider: config.provider,
        apiKey: config.apiKey,
        model: getFastModel(config.provider, config.model),
        baseUrl: config.baseUrl,
        isLocal: config.isLocal
      },
      [{ role: 'user', content: userMessage }],
      systemPrompt
    )

    // Clean up the response - remove quotes, trim, limit length
    let title = result.content.trim()
    title = title.replace(/^["']|["']$/g, '') // Remove surrounding quotes
    title = title.replace(/^Title:\s*/i, '') // Remove "Title:" prefix if present

    // Limit to reasonable length
    if (title.length > 60) {
      title = title.substring(0, 57) + '...'
    }

    return title || 'New Conversation'
  } catch (error) {
    console.error('[Title] Failed to generate title:', error)
    // Fallback: use truncated first message
    return truncateMessage(userMessage)
  }
}

/**
 * Get the fastest/cheapest model for a provider (for title generation)
 */
function getFastModel(provider: string, defaultModel: string): string {
  const fastModels: Record<string, string> = {
    anthropic: 'claude-3-haiku-20240307',
    openai: 'gpt-4o-mini',
    google: 'gemini-1.5-flash',
    mistral: 'mistral-small-latest',
    deepseek: 'deepseek-chat',
    xai: 'grok-2-mini'
  }
  return fastModels[provider] || defaultModel
}

/**
 * Fallback: truncate user message to use as title
 */
function truncateMessage(message: string): string {
  // Remove newlines and extra whitespace
  const cleaned = message.replace(/\s+/g, ' ').trim()

  if (cleaned.length <= 40) {
    return cleaned
  }

  // Try to cut at word boundary
  const truncated = cleaned.substring(0, 40)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > 20) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}
