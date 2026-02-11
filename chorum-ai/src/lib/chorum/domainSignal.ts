/**
 * Domain Signal Engine
 * Infers a project's dominant domain(s) from conversation history.
 * This is the "What are you about?" layer that makes the Conductor domain-agnostic.
 */

import { db } from '@/lib/db'
import { messages, projects } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export interface DomainSignal {
    /** Primary domain with highest confidence */
    primary: string
    /** All detected domains with confidence scores (0.0 to 1.0) */
    domains: DomainScore[]
    /** Total conversations analyzed to produce this signal */
    conversationsAnalyzed: number
    /** When this signal was last computed */
    computedAt: Date
}

export interface DomainScore {
    domain: string
    confidence: number  // 0.0 to 1.0
    /** Number of conversations that contributed to this domain detection */
    evidence: number
}

export type StoredDomainSignal = Omit<DomainSignal, 'computedAt'> & {
    computedAt: string
}

/**
 * Known domains with keyword signals for fast (non-LLM) detection.
 * The LLM-based analysis can detect domains beyond this list.
 */
export const DOMAIN_KEYWORDS: Record<string, string[]> = {
    coding: ['function', 'class', 'import', 'export', 'const', 'let', 'var', 'async', 'api', 'endpoint', 'deploy', 'git', 'commit', 'test', 'debug', 'refactor', 'component', 'interface', 'type', 'module', 'package', 'npm', 'dependency'],
    research: ['study', 'paper', 'methodology', 'hypothesis', 'data', 'findings', 'literature', 'citation', 'peer review', 'experiment', 'control group', 'variable', 'sample size', 'statistical'],
    marketing: ['audience', 'brand', 'messaging', 'campaign', 'conversion', 'positioning', 'funnel', 'engagement', 'content strategy', 'copywriting', 'value proposition', 'target market', 'persona'],
    writing: ['draft', 'chapter', 'character', 'voice', 'narrative', 'edit', 'tone', 'plot', 'dialogue', 'protagonist', 'setting', 'manuscript', 'scene'],
    business: ['revenue', 'customer', 'pricing', 'roadmap', 'investor', 'market', 'competitor', 'strategy', 'growth', 'unit economics', 'churn', 'retention', 'stakeholder'],
    legal: ['contract', 'clause', 'jurisdiction', 'compliance', 'regulation', 'liability', 'statute', 'precedent', 'plaintiff', 'defendant', 'arbitration'],
    health: ['symptom', 'medication', 'diagnosis', 'treatment', 'allergy', 'condition', 'prescription', 'dosage', 'blood pressure', 'cholesterol'],
    education: ['learn', 'course', 'curriculum', 'student', 'assignment', 'concept', 'exam', 'lecture', 'syllabus', 'grade', 'tutorial'],
    personal: ['relationship', 'gift', 'travel', 'planning', 'budget', 'home', 'family', 'birthday', 'wedding', 'vacation', 'hobby'],
    design: ['wireframe', 'prototype', 'color', 'typography', 'accessibility', 'layout', 'mockup', 'figma', 'user flow', 'responsive'],
    data: ['pipeline', 'etl', 'schema', 'warehouse', 'query', 'dashboard', 'metric', 'aggregation', 'partition', 'data lake'],
    devops: ['docker', 'kubernetes', 'ci/cd', 'deploy', 'monitor', 'infrastructure', 'terraform', 'nginx', 'load balancer', 'container'],
}

const GREETING_TOKENS = new Set([
    'hi',
    'hello',
    'hey',
    'thanks',
    'thank',
    'yo',
    'sup',
    'morning',
    'afternoon',
    'evening'
])

function isGreeting(text: string): boolean {
    const trimmed = text.trim().toLowerCase()
    if (!trimmed) return true

    const words = trimmed.split(/\s+/).filter(Boolean)
    if (words.length > 4 || trimmed.length > 40) return false

    return words.every(w => GREETING_TOKENS.has(w)) ||
        (words[0] === 'good' && words.length <= 3 && words.slice(1).every(w => GREETING_TOKENS.has(w)))
}

/**
 * Fast keyword-based domain detection for a single message.
 * Returns domain scores based on keyword frequency.
 * This is the lightweight pass — does NOT call an LLM.
 */
export function detectDomainsFromText(text: string): DomainScore[] {
    if (isGreeting(text)) return []

    const lower = text.toLowerCase()
    const words = lower.split(/\s+/).filter(Boolean)
    const scores: DomainScore[] = []

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        let hits = 0
        for (const keyword of keywords) {
            // Support multi-word keywords
            if (keyword.includes(' ')) {
                if (lower.includes(keyword)) hits++
            } else {
                if (words.includes(keyword)) hits++
            }
        }
        if (hits > 0) {
            scores.push({
                domain,
                confidence: Math.min(hits / keywords.length * 3, 1.0), // Scale: 1/3 of keywords = 100%
                evidence: hits
            })
        }
    }

    return scores.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Analyze a project's conversation history to infer its dominant domain(s).
 *
 * Strategy:
 * 1. Fetch the most recent N messages from the project
 * 2. Run keyword-based domain detection on each message
 * 3. Aggregate scores across all messages with recency weighting
 * 4. Store the result on the project record
 *
 * This is designed to be called:
 * - After every N conversations (e.g., every 5th conversation)
 * - On-demand via API/MCP
 * - During import (after conversations are loaded)
 *
 * @param projectId - The project to analyze
 * @param maxMessages - How many recent messages to sample (default 200)
 * @returns The computed DomainSignal
 */
export async function analyzeProjectDomain(
    projectId: string,
    maxMessages: number = 200
): Promise<DomainSignal> {
    // 1. Fetch recent messages (both user and assistant)
    const recentMessages = await db
        .select({
            content: messages.content,
            role: messages.role,
            createdAt: messages.createdAt
        })
        .from(messages)
        .where(eq(messages.projectId, projectId))
        .orderBy(desc(messages.createdAt))
        .limit(maxMessages)

    if (recentMessages.length === 0) {
        return {
            primary: 'general',
            domains: [],
            conversationsAnalyzed: 0,
            computedAt: new Date()
        }
    }

    // 2. Aggregate domain scores across all messages
    const domainAccumulator: Record<string, { totalConfidence: number; evidence: number }> = {}

    for (let i = 0; i < recentMessages.length; i++) {
        const msg = recentMessages[i]
        const scores = detectDomainsFromText(msg.content)

        // Recency weight: most recent messages count more
        // Linear decay from 1.0 (newest) to 0.3 (oldest in window)
        const recencyWeight = 1.0 - (i / recentMessages.length) * 0.7

        for (const score of scores) {
            if (!domainAccumulator[score.domain]) {
                domainAccumulator[score.domain] = { totalConfidence: 0, evidence: 0 }
            }
            domainAccumulator[score.domain].totalConfidence += score.confidence * recencyWeight
            domainAccumulator[score.domain].evidence += score.evidence
        }
    }

    // 3. Normalize into DomainScore array
    const maxTotal = Math.max(
        ...Object.values(domainAccumulator).map(d => d.totalConfidence),
        1 // Prevent division by zero
    )

    const domains: DomainScore[] = Object.entries(domainAccumulator)
        .map(([domain, acc]) => ({
            domain,
            confidence: Math.round((acc.totalConfidence / maxTotal) * 100) / 100,
            evidence: acc.evidence
        }))
        .filter(d => d.confidence >= 0.10) // Drop noise below 10%
        .sort((a, b) => b.confidence - a.confidence)

    const signal: DomainSignal = {
        primary: domains.length > 0 ? domains[0].domain : 'general',
        domains,
        conversationsAnalyzed: recentMessages.length,
        computedAt: new Date()
    }

    // 4. Store on project
    await db.update(projects)
        .set({
            domainSignal: {
                primary: signal.primary,
                domains: signal.domains,
                conversationsAnalyzed: signal.conversationsAnalyzed,
                computedAt: signal.computedAt.toISOString()
            }
        })
        .where(eq(projects.id, projectId))

    console.log(
        `[DomainSignal] Project ${projectId.slice(0, 8)}... -> ` +
        `primary: ${signal.primary} (${signal.domains[0]?.confidence || 0}) | ` +
        `${signal.domains.length} domains detected from ${recentMessages.length} messages`
    )

    return signal
}

/**
 * Get the cached domain signal for a project, or compute it if stale/missing.
 *
 * @param projectId - The project to get signal for
 * @param maxAgeMinutes - Recompute if signal is older than this (default 60)
 */
export async function getOrComputeDomainSignal(
    projectId: string,
    maxAgeMinutes: number = 60
): Promise<DomainSignal> {
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { domainSignal: true }
    })

    const cached = project?.domainSignal as StoredDomainSignal | null
    if (cached && cached.computedAt) {
        const age = Date.now() - new Date(cached.computedAt).getTime()
        if (age < maxAgeMinutes * 60 * 1000) {
            return {
                ...cached,
                computedAt: new Date(cached.computedAt)
            }
        }
    }

    return analyzeProjectDomain(projectId)
}


