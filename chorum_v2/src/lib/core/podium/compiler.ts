// src/lib/core/podium/compiler.ts
// Formatting and presentation of injected context.

import type { Tier } from './tiers'
import type { InjectedLearning } from '../interface'

/**
 * Get the section header for a group of learnings.
 * If the domain is null, fallback headers are used.
 */
function getHeader(type: string, domain: string | null): string {
    if (domain === 'coding') {
        switch (type) {
            case 'pattern': return '### Architecture & Patterns'
            case 'antipattern': return '### Known Gotchas (Do Not Do)'
            case 'decision': return '### Technical Decisions'
            default: return `### ${type.toUpperCase()}`
        }
    }

    if (domain === 'writing' || domain === 'research') {
        switch (type) {
            case 'character': return '### Character Profiles'
            case 'world_rule': return '### Worldbuilding Constraints'
            case 'plot_thread': return '### Active Plot Threads'
            case 'voice': return '### Voice & Tone Guidelines'
            default: return `### ${type.toUpperCase()}`
        }
    }

    // Fallback for null domain or unrecognized types
    return `### Relevant Context [${type.toUpperCase()}]`
}

/**
 * Compile selected learnings into the final injection string.
 * Formatting strategy depends on the user's Tier.
 */
export function compileContext(
    items: InjectedLearning[],
    tier: Tier,
    domain: string | null,
): string {
    if (items.length === 0) return ''

    const header = '<!-- chorum-context-start -->\n'
    const footer = '\n<!-- chorum-context-end -->'

    if (tier === 1) {
        // Compact: all items inline, no grouping
        const lines = items.map((item) => `- ${item.content}`).join('\n')
        return `${header}## Context\n${lines}${footer}`
    }

    // Tier 2 and 3: group by type with section headers
    const grouped = new Map<string, InjectedLearning[]>()
    for (const item of items) {
        const list = grouped.get(item.type) ?? []
        list.push(item)
        grouped.set(item.type, list)
    }

    const sections: string[] = []
    for (const [type, group] of grouped) {
        const sectionHeader = getHeader(type, domain)
        const lines = group.map((item) => {
            if (tier === 3) {
                // High-context models get confidence labels
                const label = item.confidence >= 0.8 ? 'verified' : item.confidence >= 0.5 ? 'likely' : 'uncertain'
                return `- [${label}] ${item.content}`
            }
            return `- ${item.content}`
        })
        sections.push(`${sectionHeader}\n${lines.join('\n')}`)
    }

    return `${header}## Context\n\n${sections.join('\n\n')}${footer}`
}
