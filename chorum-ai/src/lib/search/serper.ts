export interface SerperSearchResult {
    title: string
    link: string
    snippet: string
    position: number
}

export interface SerperResponse {
    organic: SerperSearchResult[]
    answerBox?: { snippet: string }
    knowledgeGraph?: { title: string; description: string }
}

export interface SearchOptions {
    numResults?: number  // Default 5
    country?: string     // Default 'us'
    language?: string    // Default 'en'
}

export async function searchWithSerper(
    query: string,
    apiKey: string,
    options: SearchOptions = {}
): Promise<SerperResponse> {
    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            q: query,
            gl: options.country || 'us',
            hl: options.language || 'en',
            num: options.numResults || 5
        })
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Serper API error: ${response.status} - ${error}`)
    }

    return response.json()
}

/**
 * Format search results into LLM-friendly context
 */
export function formatResultsForLLM(results: SerperResponse): string {
    const lines: string[] = []

    // Direct answer if available
    if (results.answerBox?.snippet) {
        lines.push(`**Direct Answer:** ${results.answerBox.snippet}\n`)
    }

    // Knowledge Graph info
    if (results.knowledgeGraph) {
        lines.push(`**${results.knowledgeGraph.title}:** ${results.knowledgeGraph.description}\n`)
    }

    // Organic results
    if (results.organic?.length > 0) {
        lines.push('**Search Results:**\n')
        for (const result of results.organic.slice(0, 5)) {
            lines.push(`${result.position}. [${result.title}](${result.link})`)
            lines.push(`   ${result.snippet}\n`)
        }
    } else {
        lines.push('No search results found.')
    }

    return lines.join('\n')
}
