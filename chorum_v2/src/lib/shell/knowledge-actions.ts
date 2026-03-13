'use server'

import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import {
    learnings,
    learningScopes,
    injectionAudit,
    conductorApps,
    conversations,
} from '@/db/schema'
import {
    and, or, eq, desc, asc, count, isNotNull, isNull, inArray, ilike, gte, lt,
} from 'drizzle-orm'

const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getAuthenticatedUserId(): Promise<string> {
    if (process.env.NODE_ENV === 'development') return DEV_USER_ID
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) throw new Error('Unauthorized')
    return session.user.id
}

// ---------------------------------------------------------------------------
// Domain mapping — maps scope tags to the 10 spec domain categories
// ---------------------------------------------------------------------------

const DOMAIN_CATEGORIES = [
    'Architecture', 'Debugging', 'Performance', 'Security',
    'UX / Design', 'Data / Schema', 'DevOps / Infra',
    'Product / Strategy', 'Testing', 'Documentation',
] as const

type DomainCategory = typeof DOMAIN_CATEGORIES[number]

const SCOPE_TO_DOMAIN: Record<string, DomainCategory> = {
    '#architecture': 'Architecture', '#arch': 'Architecture', '#design-patterns': 'Architecture',
    '#system-design': 'Architecture', '#api': 'Architecture',
    '#debugging': 'Debugging', '#debug': 'Debugging', '#errors': 'Debugging',
    '#troubleshooting': 'Debugging', '#fix': 'Debugging',
    '#performance': 'Performance', '#perf': 'Performance', '#optimization': 'Performance',
    '#speed': 'Performance', '#caching': 'Performance',
    '#security': 'Security', '#auth': 'Security', '#encryption': 'Security',
    '#sql-injection': 'Security', '#xss': 'Security',
    '#ux': 'UX / Design', '#ui': 'UX / Design', '#design': 'UX / Design',
    '#css': 'UX / Design', '#accessibility': 'UX / Design', '#a11y': 'UX / Design',
    '#data': 'Data / Schema', '#schema': 'Data / Schema', '#database': 'Data / Schema',
    '#sql': 'Data / Schema', '#migration': 'Data / Schema', '#orm': 'Data / Schema',
    '#devops': 'DevOps / Infra', '#infra': 'DevOps / Infra', '#ci': 'DevOps / Infra',
    '#cd': 'DevOps / Infra', '#docker': 'DevOps / Infra', '#deploy': 'DevOps / Infra',
    '#product': 'Product / Strategy', '#strategy': 'Product / Strategy',
    '#planning': 'Product / Strategy', '#roadmap': 'Product / Strategy',
    '#testing': 'Testing', '#test': 'Testing', '#jest': 'Testing',
    '#vitest': 'Testing', '#e2e': 'Testing', '#unit-test': 'Testing',
    '#docs': 'Documentation', '#documentation': 'Documentation',
    '#readme': 'Documentation', '#jsdoc': 'Documentation',
}

function scopeToDomain(scope: string): DomainCategory {
    return SCOPE_TO_DOMAIN[scope.toLowerCase()] ?? 'Architecture'
}

// ---------------------------------------------------------------------------
// Decay strength calculation
// ---------------------------------------------------------------------------

function computeDecayStrength(
    usageCount: number,
    lastUsedAt: Date | null,
    createdAt: Date,
    pinnedAt: Date | null,
): number {
    if (pinnedAt) return 1.0
    const ref = lastUsedAt ?? createdAt
    const daysSince = (Date.now() - ref.getTime()) / 86_400_000
    return Math.min(1, (usageCount * 0.1) + Math.max(0, 1 - daysSince / 90))
}

function getStrengthBracket(strength: number, pinned: boolean): 'fresh' | 'active' | 'fading' | 'dormant' | 'pinned' {
    if (pinned) return 'pinned'
    if (strength >= 0.8) return 'fresh'
    if (strength >= 0.5) return 'active'
    if (strength >= 0.2) return 'fading'
    return 'dormant'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppRegistryEntry {
    id: string
    slug: string
    displayName: string
    description: string | null
    iconUrl: string | null
    active: boolean
    lastWriteAt: Date | null
    learningCount: number
    projectCount: number
    decayHealthPercent: number
}

export interface CorpusHealthStats {
    total: number
    active: number
    pinned: number
    muted: number
    avgConfidence: number
}

export interface DecayTimePoint {
    date: string
    fresh: number
    active: number
    fading: number
    dormant: number
    pinned: number
}

export interface DomainPoint {
    domain: string
    weightedCount: number
    fullCorpus?: number
}

export interface ConfidenceStats {
    high: number
    medium: number
    low: number
    topItems: LearningItem[]
}

export interface LearningItem {
    id: string
    content: string
    type: string
    confidence: number
    confidenceBase: number
    sourceApp: string | null
    pinnedAt: Date | null
    mutedAt: Date | null
    usageCount: number
    lastUsedAt: Date | null
    createdAt: Date
    decayStrength: number
    scopes: string[]
    projectName?: string
}

export interface LearningFilters {
    sourceApp?: string | null
    type?: string | null
    status?: string | null
    domain?: string | null
    search?: string | null
    dateFilter?: string | null   // ISO date string 'YYYY-MM-DD' — from Decay Map date click
    projectId?: string | null
    sortBy?: 'confidence' | 'strength' | 'lastUsed' | 'created'
    sortDir?: 'asc' | 'desc'
}

export interface PaginatedLearnings {
    items: LearningItem[]
    total: number
    page: number
    pageSize: number
}

export interface LearningDetail extends LearningItem {
    injectionHistory: {
        conversationId: string | null
        included: boolean
        score: number
        tierUsed: number
        createdAt: Date
    }[]
}

// ---------------------------------------------------------------------------
// Internal mapping helper
// ---------------------------------------------------------------------------

type RawLearning = {
    id: string
    content: string
    type: string
    confidence: number
    confidenceBase: number
    sourceApp: string | null
    pinnedAt: Date | null
    mutedAt: Date | null
    usageCount: number
    lastUsedAt: Date | null
    createdAt: Date
}

function mapLearningItem(l: RawLearning, scopeMap: Map<string, string[]>): LearningItem {
    return {
        id: l.id,
        content: l.content,
        type: l.type,
        confidence: l.confidence,
        confidenceBase: l.confidenceBase,
        sourceApp: l.sourceApp,
        pinnedAt: l.pinnedAt,
        mutedAt: l.mutedAt,
        usageCount: l.usageCount,
        lastUsedAt: l.lastUsedAt,
        createdAt: l.createdAt,
        decayStrength: computeDecayStrength(l.usageCount, l.lastUsedAt, l.createdAt, l.pinnedAt),
        scopes: scopeMap.get(l.id) ?? [],
    }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function getConnectedApps(): Promise<AppRegistryEntry[]> {
    const userId = await getAuthenticatedUserId()

    // Return system apps (owner_id IS NULL) + user-owned apps
    const apps = await db
        .select()
        .from(conductorApps)
        .where(or(
            isNull(conductorApps.ownerId),
            eq(conductorApps.ownerId, userId),
        ))

    const allLearnings = await db
        .select({
            id: learnings.id,
            sourceApp: learnings.sourceApp,
            usageCount: learnings.usageCount,
            lastUsedAt: learnings.lastUsedAt,
            createdAt: learnings.createdAt,
            pinnedAt: learnings.pinnedAt,
        })
        .from(learnings)
        .where(eq(learnings.userId, userId))

    return apps.map(app => {
        const appLearnings = allLearnings.filter(l =>
            (l.sourceApp ?? 'chorum-core') === app.slug
        )
        const healthyCount = appLearnings.filter(l => {
            const strength = computeDecayStrength(l.usageCount, l.lastUsedAt, l.createdAt, l.pinnedAt)
            return strength > 0.2
        }).length

        return {
            id: app.id,
            slug: app.slug,
            displayName: app.displayName,
            description: app.description,
            iconUrl: app.iconUrl,
            active: app.active,
            lastWriteAt: app.lastWriteAt,
            learningCount: appLearnings.length,
            projectCount: 0,
            decayHealthPercent: appLearnings.length > 0
                ? Math.round((healthyCount / appLearnings.length) * 100)
                : 100,
        }
    })
}

export async function getCorpusHealth(projectId?: string): Promise<CorpusHealthStats> {
    const userId = await getAuthenticatedUserId()

    const conditions = [eq(learnings.userId, userId)]
    if (projectId) {
        conditions.push(inArray(
            learnings.sourceConversationId,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId))
        ))
    }

    const allLearnings = await db
        .select({
            id: learnings.id,
            confidence: learnings.confidence,
            confidenceBase: learnings.confidenceBase,
            usageCount: learnings.usageCount,
            lastUsedAt: learnings.lastUsedAt,
            createdAt: learnings.createdAt,
            pinnedAt: learnings.pinnedAt,
            mutedAt: learnings.mutedAt,
        })
        .from(learnings)
        .where(and(...conditions))

    const total = allLearnings.length
    const pinned = allLearnings.filter(l => l.pinnedAt !== null).length
    const muted = allLearnings.filter(l => l.mutedAt !== null).length
    const active = allLearnings.filter(l => {
        const strength = computeDecayStrength(l.usageCount, l.lastUsedAt, l.createdAt, l.pinnedAt)
        return strength > 0.2
    }).length
    const avgConfidence = total > 0
        ? Math.round((allLearnings.reduce((sum, l) => sum + l.confidence, 0) / total) * 100) / 100
        : 0

    return { total, active, pinned, muted, avgConfidence }
}

export async function getDecayTimeSeries(
    days: 14 | 30 | 90 = 30,
    sourceApp?: string,
    projectId?: string,
): Promise<DecayTimePoint[]> {
    const userId = await getAuthenticatedUserId()

    const conditions = [eq(learnings.userId, userId)]
    if (projectId) {
        conditions.push(inArray(
            learnings.sourceConversationId,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId))
        ))
    }

    const allLearnings = await db
        .select({
            id: learnings.id,
            usageCount: learnings.usageCount,
            lastUsedAt: learnings.lastUsedAt,
            createdAt: learnings.createdAt,
            pinnedAt: learnings.pinnedAt,
            sourceApp: learnings.sourceApp,
        })
        .from(learnings)
        .where(and(...conditions))

    const filtered = sourceApp
        ? allLearnings.filter(l => (l.sourceApp ?? 'chorum-core') === sourceApp)
        : allLearnings

    const now = new Date()
    const points: DecayTimePoint[] = []

    for (let d = days - 1; d >= 0; d--) {
        const date = new Date(now)
        date.setDate(date.getDate() - d)
        const dateStr = date.toISOString().slice(0, 10)

        const counts = { fresh: 0, active: 0, fading: 0, dormant: 0, pinned: 0 }

        for (const l of filtered) {
            if (l.createdAt > date) continue
            const refDate = l.lastUsedAt && l.lastUsedAt <= date ? l.lastUsedAt : l.createdAt
            const daysSince = (date.getTime() - refDate.getTime()) / 86_400_000
            const strength = l.pinnedAt
                ? 1.0
                : Math.min(1, (l.usageCount * 0.1) + Math.max(0, 1 - daysSince / 90))
            const bracket = getStrengthBracket(strength, l.pinnedAt !== null)
            counts[bracket]++
        }

        points.push({ date: dateStr, ...counts })
    }

    return points
}

export async function getDomainDistribution(
    sourceApp?: string,
    projectId?: string,
): Promise<DomainPoint[]> {
    const userId = await getAuthenticatedUserId()

    const conditions = [eq(learnings.userId, userId)]
    if (projectId) {
        conditions.push(inArray(
            learnings.sourceConversationId,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId))
        ))
    }

    const rows = await db
        .select({
            learningId: learnings.id,
            confidence: learnings.confidence,
            sourceApp: learnings.sourceApp,
            scope: learningScopes.scope,
        })
        .from(learnings)
        .leftJoin(learningScopes, eq(learnings.id, learningScopes.learningId))
        .where(and(...conditions))

    const domainWeights: Record<string, number> = {}
    for (const cat of DOMAIN_CATEGORIES) domainWeights[cat] = 0

    for (const row of rows) {
        if (sourceApp && (row.sourceApp ?? 'chorum-core') !== sourceApp) continue
        if (!row.scope) continue
        const domain = scopeToDomain(row.scope)
        domainWeights[domain] = (domainWeights[domain] ?? 0) + row.confidence
    }

    return DOMAIN_CATEGORIES.map(d => ({
        domain: d,
        weightedCount: Math.round((domainWeights[d] ?? 0) * 10) / 10,
    }))
}

export async function getConfidenceDistribution(
    sourceApp?: string,
    projectId?: string,
): Promise<ConfidenceStats> {
    const userId = await getAuthenticatedUserId()

    const conditions = [eq(learnings.userId, userId)]
    if (projectId) {
        conditions.push(inArray(
            learnings.sourceConversationId,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId))
        ))
    }

    const allLearnings = await db
        .select({
            id: learnings.id,
            content: learnings.content,
            type: learnings.type,
            confidence: learnings.confidence,
            confidenceBase: learnings.confidenceBase,
            sourceApp: learnings.sourceApp,
            pinnedAt: learnings.pinnedAt,
            mutedAt: learnings.mutedAt,
            usageCount: learnings.usageCount,
            lastUsedAt: learnings.lastUsedAt,
            createdAt: learnings.createdAt,
        })
        .from(learnings)
        .where(and(...conditions))

    const filtered = sourceApp
        ? allLearnings.filter(l => (l.sourceApp ?? 'chorum-core') === sourceApp)
        : allLearnings

    let high = 0, medium = 0, low = 0
    for (const l of filtered) {
        if (l.confidence > 0.8) high++
        else if (l.confidence >= 0.5) medium++
        else low++
    }

    const topRaw = [...filtered].sort((a, b) => b.confidence - a.confidence).slice(0, 5)
    const topIds = topRaw.map(l => l.id)
    const scopeRows = topIds.length > 0
        ? await db.select().from(learningScopes).where(inArray(learningScopes.learningId, topIds))
        : []
    const scopeMap = new Map<string, string[]>()
    for (const s of scopeRows) {
        if (!scopeMap.has(s.learningId)) scopeMap.set(s.learningId, [])
        scopeMap.get(s.learningId)!.push(s.scope)
    }

    const topItems: LearningItem[] = topRaw.map(l => mapLearningItem(l, scopeMap))

    return { high, medium, low, topItems }
}

export async function getLearnings(
    filters: LearningFilters = {},
    page: number = 1,
): Promise<PaginatedLearnings> {
    const userId = await getAuthenticatedUserId()
    const pageSize = 25
    const offset = (page - 1) * pageSize

    // Build DB-level conditions
    const conditions = [eq(learnings.userId, userId)]

    if (filters.sourceApp) {
        conditions.push(eq(learnings.sourceApp, filters.sourceApp))
    }
    if (filters.projectId) {
        conditions.push(inArray(
            learnings.sourceConversationId,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, filters.projectId))
        ))
    }
    if (filters.type) {
        conditions.push(eq(learnings.type, filters.type))
    }
    if (filters.status === 'pinned') {
        conditions.push(isNotNull(learnings.pinnedAt))
    } else if (filters.status === 'muted') {
        conditions.push(isNotNull(learnings.mutedAt))
    }
    if (filters.search) {
        conditions.push(ilike(learnings.content, `%${filters.search}%`))
    }
    if (filters.dateFilter) {
        // Filter to learnings created on the clicked date (UTC day boundaries)
        const dayStart = new Date(`${filters.dateFilter}T00:00:00.000Z`)
        const dayEnd = new Date(`${filters.dateFilter}T23:59:59.999Z`)
        conditions.push(gte(learnings.createdAt, dayStart))
        conditions.push(lt(learnings.createdAt, dayEnd))
    }

    const sortMap: Record<string, typeof learnings.confidence | typeof learnings.lastUsedAt | typeof learnings.createdAt> = {
        confidence: learnings.confidence,
        lastUsed: learnings.lastUsedAt,
        created: learnings.createdAt,
    }
    const sortCol = sortMap[filters.sortBy ?? 'created'] ?? learnings.createdAt
    const sortFn = filters.sortDir === 'asc' ? asc : desc

    // Filters that require client-side computation (decay strength, domain) need all-rows fetch
    const needsClientFilter =
        filters.status === 'active' ||
        filters.status === 'dormant' ||
        !!filters.domain ||
        filters.sortBy === 'strength'

    if (needsClientFilter) {
        // Fetch all rows matching DB conditions, filter and paginate in memory
        // so total count and pagination are accurate
        const allRows = await db
            .select()
            .from(learnings)
            .where(and(...conditions))
            .orderBy(sortFn(sortCol))

        const ids = allRows.map(r => r.id)
        const scopeRows = ids.length > 0
            ? await db.select().from(learningScopes).where(inArray(learningScopes.learningId, ids))
            : []
        const scopeMap = new Map<string, string[]>()
        for (const s of scopeRows) {
            if (!scopeMap.has(s.learningId)) scopeMap.set(s.learningId, [])
            scopeMap.get(s.learningId)!.push(s.scope)
        }

        let allItems = allRows.map(l => mapLearningItem(l, scopeMap))

        if (filters.status === 'active') {
            allItems = allItems.filter(i => i.decayStrength > 0.2 && !i.pinnedAt && !i.mutedAt)
        } else if (filters.status === 'dormant') {
            allItems = allItems.filter(i => i.decayStrength <= 0.2 && !i.pinnedAt && !i.mutedAt)
        }
        if (filters.domain) {
            allItems = allItems.filter(i =>
                i.scopes.some(s => scopeToDomain(s) === filters.domain)
            )
        }
        if (filters.sortBy === 'strength') {
            allItems.sort((a, b) =>
                filters.sortDir === 'asc'
                    ? a.decayStrength - b.decayStrength
                    : b.decayStrength - a.decayStrength
            )
        }

        const total = allItems.length
        const items = allItems.slice(offset, offset + pageSize)
        return { items, total, page, pageSize }
    }

    // Standard DB-paginated path (exact counts, efficient)
    const [rows, totalResult] = await Promise.all([
        db.select()
            .from(learnings)
            .where(and(...conditions))
            .orderBy(sortFn(sortCol))
            .limit(pageSize)
            .offset(offset),
        db.select({ count: count() })
            .from(learnings)
            .where(and(...conditions)),
    ])

    const total = totalResult[0]?.count ?? 0
    const ids = rows.map(r => r.id)
    const scopeRows = ids.length > 0
        ? await db.select().from(learningScopes).where(inArray(learningScopes.learningId, ids))
        : []
    const scopeMap = new Map<string, string[]>()
    for (const s of scopeRows) {
        if (!scopeMap.has(s.learningId)) scopeMap.set(s.learningId, [])
        scopeMap.get(s.learningId)!.push(s.scope)
    }

    const items = rows.map(l => mapLearningItem(l, scopeMap))
    return { items, total, page, pageSize }
}

export async function getLearningDetail(id: string): Promise<LearningDetail | null> {
    const userId = await getAuthenticatedUserId()

    const [row] = await db
        .select()
        .from(learnings)
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
        .limit(1)

    if (!row) return null

    const scopeRows = await db
        .select()
        .from(learningScopes)
        .where(eq(learningScopes.learningId, id))

    const injections = await db
        .select({
            conversationId: injectionAudit.conversationId,
            included: injectionAudit.included,
            score: injectionAudit.score,
            tierUsed: injectionAudit.tierUsed,
            createdAt: injectionAudit.createdAt,
        })
        .from(injectionAudit)
        .where(and(
            eq(injectionAudit.learningId, id),
            eq(injectionAudit.userId, userId),
        ))
        .orderBy(desc(injectionAudit.createdAt))
        .limit(10)

    const scopeMap = new Map([[id, scopeRows.map(s => s.scope)]])

    return {
        ...mapLearningItem(row, scopeMap),
        injectionHistory: injections.map(i => ({
            conversationId: i.conversationId,
            included: i.included,
            score: i.score,
            tierUsed: i.tierUsed,
            createdAt: i.createdAt,
        })),
    }
}

// ---------------------------------------------------------------------------
// Mutation Actions
// ---------------------------------------------------------------------------

export async function pinLearning(id: string): Promise<void> {
    const userId = await getAuthenticatedUserId()
    await db.update(learnings)
        .set({ pinnedAt: new Date(), mutedAt: null, updatedAt: new Date() })
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
}

export async function unpinLearning(id: string): Promise<void> {
    const userId = await getAuthenticatedUserId()
    await db.update(learnings)
        .set({ pinnedAt: null, updatedAt: new Date() })
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
}

export async function muteLearning(id: string): Promise<void> {
    const userId = await getAuthenticatedUserId()
    await db.update(learnings)
        .set({ mutedAt: new Date(), pinnedAt: null, updatedAt: new Date() })
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
}

export async function unmuteLearning(id: string): Promise<void> {
    const userId = await getAuthenticatedUserId()
    await db.update(learnings)
        .set({ mutedAt: null, updatedAt: new Date() })
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
}

export async function deleteLearning(id: string): Promise<void> {
    const userId = await getAuthenticatedUserId()
    await db.delete(learnings)
        .where(and(eq(learnings.id, id), eq(learnings.userId, userId)))
}
