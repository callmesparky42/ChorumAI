/**
 * Learning Context Injector
 * Injects learned patterns, invariants, and critical file info into system prompts.
 * Returns cached data to avoid redundant DB calls during validation.
 */

import { getProjectLearning } from './manager'
import { db } from '@/lib/db'
import { projectFileMetadata } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { LearningItem } from './types'

const MAX_CONTEXT_CHARS = 8000 // ~2000 tokens, reasonable budget

export interface LearningContext {
    /** Modified system prompt with learning context injected */
    systemPrompt: string
    /** Cached learning items for validation (avoids second DB call) */
    learningItems: LearningItem[]
    /** Cached critical file paths */
    criticalFiles: string[]
    /** Invariants specifically (common use case) */
    invariants: LearningItem[]
}

/**
 * Inject learning context into system prompt and return cached data.
 * Single DB fetch - returns everything needed for both prompt injection and validation.
 */
export async function injectLearningContext(
    basePrompt: string,
    projectId: string
): Promise<LearningContext> {
    // Single fetch for all learning items
    const learningItems = await getProjectLearning(projectId)

    // Single fetch for file metadata - ONLY for this project
    const fileMeta = await db.select()
        .from(projectFileMetadata)
        .where(eq(projectFileMetadata.projectId, projectId))

    const criticalFiles = fileMeta
        .filter(f => f.isCritical)
        .map(f => f.filePath)

    // Categorize items
    const patterns = learningItems.filter(i => i.type === 'pattern' || i.type === 'golden_path')
    const invariants = learningItems.filter(i => i.type === 'invariant')
    const antipatterns = learningItems.filter(i => i.type === 'antipattern')
    const decisions = learningItems.filter(i => i.type === 'decision')

    // Build context sections (prioritized - invariants first)
    const sections: string[] = []

    // 1. Invariants - CRITICAL, always include first
    if (invariants.length > 0) {
        const section = buildInvariantsSection(invariants)
        sections.push(section)
    }

    // 2. Critical Files - Important for safety
    if (criticalFiles.length > 0) {
        const section = buildCriticalFilesSection(criticalFiles, fileMeta)
        sections.push(section)
    }

    // 3. Antipatterns - What to avoid
    if (antipatterns.length > 0) {
        const section = buildAntipatternSection(antipatterns)
        sections.push(section)
    }

    // 4. Patterns & Golden Paths - Best practices
    if (patterns.length > 0) {
        const section = buildPatternsSection(patterns)
        sections.push(section)
    }

    // 5. Key Decisions - Context for "why"
    if (decisions.length > 0) {
        const section = buildDecisionsSection(decisions)
        sections.push(section)
    }

    // Combine and check token budget
    let learningContext = sections.join('\n')

    if (learningContext.length > MAX_CONTEXT_CHARS) {
        // Truncate from the bottom (decisions are lowest priority)
        learningContext = truncateWithPriority(sections, MAX_CONTEXT_CHARS)
    }

    const systemPrompt = learningContext
        ? basePrompt + '\n\n---\n# Project Learning Context\n' + learningContext
        : basePrompt

    return {
        systemPrompt,
        learningItems,
        criticalFiles,
        invariants
    }
}

function buildInvariantsSection(invariants: LearningItem[]): string {
    let section = '## INVARIANTS (MUST FOLLOW)\nThese rules cannot be violated:\n'
    for (const inv of invariants) {
        section += `- **${inv.content}**`
        if (inv.context) {
            section += ` — ${inv.context}`
        }
        section += '\n'
    }
    return section
}

function buildCriticalFilesSection(
    criticalFiles: string[],
    fileMeta: { filePath: string; linkedInvariants: string[] | null }[]
): string {
    let section = '## CRITICAL FILES (Tier A)\nThese files require extra care:\n'
    for (const path of criticalFiles) {
        const meta = fileMeta.find(f => f.filePath === path)
        section += `- \`${path}\``
        if (meta?.linkedInvariants?.length) {
            section += ` (linked to ${meta.linkedInvariants.length} invariant(s))`
        }
        section += '\n'
    }
    return section
}

function buildAntipatternSection(antipatterns: LearningItem[]): string {
    let section = '## ANTIPATTERNS (AVOID)\nKnown issues to avoid:\n'
    for (const ap of antipatterns) {
        section += `- ❌ ${ap.content}`
        if (ap.context) {
            section += ` — ${ap.context}`
        }
        section += '\n'
    }
    return section
}

function buildPatternsSection(patterns: LearningItem[]): string {
    let section = '## LEARNED PATTERNS\nEstablished practices for this project:\n'
    for (const p of patterns) {
        section += `- ✓ ${p.content}`
        if (p.context) {
            section += ` — ${p.context}`
        }
        section += '\n'
    }
    return section
}

function buildDecisionsSection(decisions: LearningItem[]): string {
    let section = '## KEY DECISIONS\nArchitectural decisions and rationale:\n'
    for (const d of decisions) {
        section += `- ${d.content}`
        if (d.context) {
            section += `\n  Rationale: ${d.context}`
        }
        section += '\n'
    }
    return section
}

/**
 * Truncate sections while preserving priority order.
 * Invariants and critical files are never truncated.
 */
function truncateWithPriority(sections: string[], maxChars: number): string {
    let result = ''
    let remaining = maxChars

    for (const section of sections) {
        if (section.length <= remaining) {
            result += section + '\n'
            remaining -= section.length + 1
        } else if (remaining > 200) {
            // Partial include with truncation notice
            result += section.substring(0, remaining - 50) + '\n... (truncated for context limit)\n'
            break
        } else {
            break
        }
    }

    return result.trim()
}
