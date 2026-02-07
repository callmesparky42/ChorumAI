import { calculateDecay } from '@/lib/chorum/relevance'

/**
 * Filter items whose decay score has fallen below the relevance floor.
 * Items that have decayed below threshold shouldn't be compiled into
 * cached context, even if they have high usage counts.
 */
function isStillRelevant(item: LearningItem, minDecayScore: number = 0.10): boolean {
    const daysSince = item.createdAt
        ? (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        : 365
    return calculateDecay(daysSince, item.type) > minDecayScore
}

/**
 * Compile Tier 1: DNA Summary (~200-400 tokens)
 * A single dense paragraph capturing the project's essence.
 */
export async function compileTier1(
    projectId: string,
    learnings: LearningItem[],
    provider?: CompilerProviderConfig
): Promise<CompiledCache> {
    // 1. Separate by type
    const invariants = learnings.filter(l => l.type === 'invariant')
    const patterns = learnings.filter(l => l.type === 'pattern')
    const decisions = learnings.filter(l => l.type === 'decision')

    // 2. Rank within each type by usage count (filtered by decay)
    const topInvariants = invariants
        .filter(i => isStillRelevant(i))
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 5)

    const topPatterns = patterns
        .filter(i => isStillRelevant(i))
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 5)

    const topDecisions = decisions
        .filter(i => isStillRelevant(i))
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 3)

    // ... (rest of compileTier1)

    // 3. If total items <= 3 or no provider, just format directly
    if (!provider || topInvariants.length + topPatterns.length + topDecisions.length <= 3) {
        // ...
        const minimal = formatMinimalContext(topInvariants, topPatterns, topDecisions)
        return {
            // ...
            tier: 1,
            compiledContext: minimal,
            tokenEstimate: estimateTokens(minimal),
            learningCount: learnings.length,
            invariantCount: invariants.length
        }
    }

    // 4. Use LLM to compress
    try {
        const compiled = await compressWithLLM(topInvariants, topPatterns, topDecisions, provider)
        return {
            tier: 1,
            compiledContext: compiled,
            tokenEstimate: estimateTokens(compiled),
            learningCount: learnings.length,
            invariantCount: invariants.length
        }
    } catch (e) {
        console.warn('Tier 1 compilation failed, falling back to minimal format', e)
        const minimal = formatMinimalContext(topInvariants, topPatterns, topDecisions)
        return {
            tier: 1,
            compiledContext: minimal,
            tokenEstimate: estimateTokens(minimal),
            learningCount: learnings.length,
            invariantCount: invariants.length
        }
    }
}

/**
 * Compile Tier 2: Field Guide (~1000-2500 tokens)
 * Structured summary with clusters and all invariants.
 */
export async function compileTier2(
    projectId: string,
    learnings: LearningItem[],
    provider?: CompilerProviderConfig
): Promise<CompiledCache> {
    const invariants = learnings.filter(l => l.type === 'invariant')
    const patterns = learnings.filter(l => l.type === 'pattern')
    const decisions = learnings.filter(l => l.type === 'decision')
    const goldenPaths = learnings.filter(l => l.type === 'golden_path')
    const antipatterns = learnings.filter(l => l.type === 'antipattern')

    // 1. ALL invariants go in (they never decay)
    const invariantSection = invariants.length
        ? `## Rules (Never Violate)\n${invariants.map(i => `- ${i.content}`).join('\n')}`
        : ''

    // 2. Cluster patterns + decisions by domain
    const domainClusters = clusterByDomain([...patterns, ...decisions])

    // 3. Summarize clusters
    const clusterSections: string[] = []
    for (const [domain, items] of Object.entries(domainClusters)) {
        if (items.length <= 3 || !provider) {
            // Small cluster or no provider: list top 3 relevant
            const top = items
                .filter(i => isStillRelevant(i))
                .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
                .slice(0, 3)

            if (top.length > 0) {
                clusterSections.push(`**${domain}:** ${top.map(i => i.content).join('; ')}`)
            }
        } else {
            // Filter relevant items before summarizing
            const relevantItems = items.filter(i => isStillRelevant(i))

            if (relevantItems.length === 0) continue

            try {
                const summary = await summarizeCluster(domain, relevantItems, provider)
                clusterSections.push(`**${domain}:** ${summary}`)
            } catch (e) {
                console.warn(`Cluster summary for ${domain} failed, falling back to list`, e)
                const top = relevantItems.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 3)
                clusterSections.push(`**${domain}:** ${top.map(i => i.content).join('; ')}`)
            }
        }
    }

    // 4. Recipes (Golden Paths)
    const relevantGP = goldenPaths.filter(g => isStillRelevant(g))
    const gpSection = relevantGP.length
        ? `## Recipes\n${relevantGP.slice(0, 3).map(g => `- ${g.content}`).join('\n')}`
        : ''

    // 5. Antipatterns
    const relevantAP = antipatterns.filter(a => isStillRelevant(a))
    const apSection = relevantAP.length
        ? `## Avoid\n${relevantAP.slice(0, 3).map(a => `- ${a.content}`).join('\n')}`
        : ''

    // 6. Assemble
    const sections = [
        invariantSection,
        clusterSections.length ? `## Patterns & Decisions\n${clusterSections.join('\n')}` : '',
        gpSection,
        apSection
    ].filter(Boolean)

    const compiled = sections.join('\n\n')

    return {
        tier: 2,
        compiledContext: compiled,
        tokenEstimate: estimateTokens(compiled),
        learningCount: learnings.length,
        invariantCount: invariants.length
    }
}

// --- Helpers ---

function formatMinimalContext(invariants: LearningItem[], patterns: LearningItem[], decisions: LearningItem[]): string {
    let lines: string[] = []
    if (invariants.length) lines.push(`Rules: ${invariants.map(i => i.content).join('; ')}`)
    if (patterns.length) lines.push(`Patterns: ${patterns.map(p => p.content).join('; ')}`)
    if (decisions.length) lines.push(`Decisions: ${decisions.map(d => d.content).join('; ')}`)
    return lines.join('. ')
}

function clusterByDomain(items: LearningItem[]): Record<string, LearningItem[]> {
    const clusters: Record<string, LearningItem[]> = {}
    for (const item of items) {
        const domains = (item.domains && item.domains.length > 0) ? item.domains : ['General']
        for (const domain of domains) {
            if (!clusters[domain]) clusters[domain] = []
            clusters[domain].push(item)
        }
    }
    return clusters
}

async function compressWithLLM(
    invariants: LearningItem[],
    patterns: LearningItem[],
    decisions: LearningItem[],
    provider: CompilerProviderConfig
): Promise<string> {
    const prompt = `You are compressing project knowledge into a single dense paragraph for an AI assistant's system prompt. This paragraph must capture the most critical rules and patterns for this project.

CONSTRAINTS:
- Maximum 300 tokens (roughly 400 words)
- Write in second person ("You must...", "This project uses...")
- Lead with non-negotiable rules (invariants)
- Then dominant patterns and key decisions
- No bullet points, no headers — flowing prose only
- Every sentence must carry information — no filler

INVARIANTS (rules that must NEVER be violated):
${invariants.map(i => `- ${i.content}`).join('\n')}

KEY PATTERNS:
${patterns.map(p => `- ${p.content}`).join('\n')}

KEY DECISIONS:
${decisions.map(d => `- ${d.content}${d.context ? ` (${d.context})` : ''}`).join('\n')}

Compress all of the above into a single paragraph:`

    const result = await callProvider(
        {
            provider: provider.provider as any,
            apiKey: provider.apiKey,
            model: provider.model,
            baseUrl: provider.baseUrl,
            isLocal: provider.isLocal
        },
        [{ role: 'user', content: prompt }],
        'You are a technical documentation expert.'
    )

    return result.content
}

async function summarizeCluster(
    domain: string,
    items: LearningItem[],
    provider: CompilerProviderConfig
): Promise<string> {
    const prompt = `Summarize the following ${domain} patterns and decisions into 2-3 concise sentences. Focus on the consensus or standard approach.

ITEMS:
${items.map(i => `- ${i.content}`).join('\n')}

Summary:`

    const result = await callProvider(
        {
            provider: provider.provider as any,
            apiKey: provider.apiKey,
            model: provider.model,
            baseUrl: provider.baseUrl,
            isLocal: provider.isLocal
        },
        [{ role: 'user', content: prompt }],
        'You are a technical documentation expert.'
    )

    return result.content
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}
