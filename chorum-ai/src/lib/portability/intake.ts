import { ParseResult } from './parsers'

export type ImportType = 'json' | 'text'

export interface ImportPayload {
    type: ImportType
    data?: unknown
    text?: string
    hint?: string
}

export function prepareImportPayload(raw: string, ext?: string): ImportPayload {
    // 1. Try JSON.parse(raw)
    try {
        const parsed = JSON.parse(raw)
        // If it parses as JSON, we treat it as JSON type
        return { type: 'json', data: parsed }
    } catch (e) {
        // 2. If JSON parse fails, it's likely a text format
    }

    // 3. Determine hint from extension or default to unknown
    const hint = ext ? ext.toLowerCase().replace(/^\./, '') : 'unknown'

    // Special case: .json extension but failed to parse -> malformed-json hint
    const finalHint = (hint === 'json') ? 'malformed-json' : hint

    return {
        type: 'text',
        text: raw,
        hint: finalHint
    }
}
