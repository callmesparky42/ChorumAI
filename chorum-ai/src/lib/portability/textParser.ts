import { NormalizedConversation, NormalizedMessage, ParseResult } from './parsers'

// Heuristics for detecting Claude Desktop pasted content
const CLAUDE_MARKERS = [
    /Edited \d+ files?/,
    /Viewed \d+ files?/,
    /Presented \d+ files?/,
    /Created a file/,
    /ran a command/,
    /Code ·/,
    /Image ·/
]

function isClaudeDesktopPaste(text: string): boolean {
    let matchCount = 0
    for (const marker of CLAUDE_MARKERS) {
        if (marker.test(text)) {
            matchCount++
        }
    }
    // Arbitrary threshold: 3 checks to be relatively sure
    return matchCount >= 3
}

// ---------------------------------------------------------------------------
// Claude Desktop Parser
// ---------------------------------------------------------------------------

function parseClaudeDesktopPaste(text: string): ParseResult {
    const messages: NormalizedMessage[] = []
    const lines = text.split('\n')
    let buffer: string[] = []
    let currentRole: 'user' | 'assistant' = 'user'

    // Helper to flush buffer to messages
    const flush = (nextRole: 'user' | 'assistant') => {
        if (buffer.length > 0) {
            const content = buffer.join('\n').trim()
            if (content) {
                // If we are switching role, push the message
                // Or if we are same role but maybe want to separate?
                // For now, let's just push.
                // However, Claude pastes might have "Tool Use" then "Output" then "Explanation"
                // which might all be assistant. merging them is safer.
                if (messages.length > 0 && messages[messages.length - 1].role === currentRole) {
                    messages[messages.length - 1].content += '\n\n' + content
                } else {
                    messages.push({ role: currentRole, content })
                }
            }
        }
        buffer = []
        currentRole = nextRole
    }

    // Heuristic: "Done" or "DoneDone." on a line by itself usually marks end of assistant action
    // "Code · TSX" or "Viewed N files" usually marks start of assistant action

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimLine = line.trim()

        // Check for Assistant turn start indicators (Tool use summaries or Artifact headers)
        const isAssistantStart = CLAUDE_MARKERS.some(m => m.test(line))

        // Check for Assistant turn END indicators
        // "Done" or "DoneDone." often appear after tool use
        const isAssistantEnd = trimLine === 'Done' || trimLine === 'Done.' || trimLine === 'DoneDone' || trimLine === 'DoneDone.'

        if (isAssistantStart) {
            if (currentRole === 'user') {
                flush('assistant')
            }
            // We usually want to include the tool summary line in the assistant's turn
            // But maybe strip "Open in..." suffix?
            // checking "Code · "
            if (line.includes('Code ·') || line.includes('Image ·')) {
                // Keep it, but maybe strip the "Open in..."
                buffer.push(line.replace(/Open in .*$/, '').trim())
            } else {
                buffer.push(line)
            }
        } else if (isAssistantEnd) {
            // End of assistant block -> ignore the "Done" line usually?
            // Or keep it? It's noise. Let's skip it.
            // But we MUST flush and switch to USER, because what follows is usually user text
            if ((currentRole as string) === 'assistant') {
                flush('user')
            }
        } else {
            // content
            buffer.push(line)
        }
    }

    // Flush remaining
    flush('user') // role doesn't matter for the very last flush since we push based on currentRole

    // Post-processing to remove empty messages
    const validMessages = messages.filter(m => m.content.trim().length > 0)

    return {
        format: 'claude',
        conversations: validMessages.length > 0 ? [{ messages: validMessages }] : [],
        warnings: []
    }
}

// ---------------------------------------------------------------------------
// Role Parser (Human: / Assistant:)
// ---------------------------------------------------------------------------

function parseRolePrefixedText(text: string): ParseResult {
    const messages: NormalizedMessage[] = []

    // Regex to split by ^Role:
    // We match start of line, Role Name, then colon.
    // We want to capture the role name to know which one it is.
    const roleRegex = /^(User|Human|Assistant|AI|Claude|System):/gmi

    // We can't use split directly easily because we need the delimiter.
    // Let's iterate.

    const tokenized = text.split(/(?=^(?:User|Human|Assistant|AI|Claude|System):)/mi)

    for (const chunk of tokenized) {
        if (!chunk.trim()) continue

        const match = /^(User|Human|Assistant|AI|Claude|System):\s*([\s\S]*)/i.exec(chunk)
        if (match) {
            const roleStr = match[1].toLowerCase()
            const content = match[2].trim()

            let role: 'user' | 'assistant' = 'user'
            if (['assistant', 'ai', 'claude'].includes(roleStr)) {
                role = 'assistant'
            }
            // 'system' -> usually treat as user context or skip? 
            // Let's map system to user for now so it's included in context

            if (content) {
                messages.push({ role, content })
            }
        } else {
            // Chunk didn't match role pattern? 
            // Might be preamble text. Treat as user.
            messages.push({ role: 'user', content: chunk.trim() })
        }
    }

    return {
        format: 'generic',
        conversations: messages.length > 0 ? [{ messages }] : [],
        warnings: []
    }
}

// ---------------------------------------------------------------------------
// Markdown Header Parser (## User)
// ---------------------------------------------------------------------------

function parseMarkdownTurns(text: string): ParseResult {
    const messages: NormalizedMessage[] = []
    // Split by ## Role
    const chunks = text.split(/(?=^#{1,3}\s*(?:User|Human|Assistant|AI))/mi)

    for (const chunk of chunks) {
        if (!chunk.trim()) continue

        const match = /^#{1,3}\s*(User|Human|Assistant|AI)\s*\n([\s\S]*)/i.exec(chunk)
        if (match) {
            const roleStr = match[1].toLowerCase()
            const content = match[2].trim()

            let role: 'user' | 'assistant' = 'user'
            if (['assistant', 'ai'].includes(roleStr)) {
                role = 'assistant'
            }

            if (content) {
                messages.push({ role, content })
            }
        } else {
            // Preamble
            messages.push({ role: 'user', content: chunk.trim() })
        }
    }

    return {
        format: 'generic',
        conversations: messages.length > 0 ? [{ messages }] : [],
        warnings: []
    }
}


// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export function parseTextConversation(text: string, hint?: string): ParseResult {
    // 1. Try Claude Desktop Heuristic
    if (isClaudeDesktopPaste(text)) {
        return parseClaudeDesktopPaste(text)
    }

    // 2. Try Role Prefixed (Human: ...)
    // Check if we have at least 2 occurances of roles to be confident?
    if (/^(User|Human|Assistant|AI|Claude|System):/mi.test(text)) {
        return parseRolePrefixedText(text)
    }

    // 3. Try Markdown Headers
    if (/^#{1,3}\s*(User|Human|Assistant|AI)/mi.test(text)) {
        return parseMarkdownTurns(text)
    }

    // 4. Default: Single user message
    return {
        format: 'generic',
        conversations: [{
            messages: [{
                role: 'user',
                content: text
            }]
        }],
        warnings: ['Could not detect conversation structure. Created single user message.']
    }
}
