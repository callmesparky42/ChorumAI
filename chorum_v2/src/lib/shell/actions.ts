'use server'

import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { LocalChorumClient } from '@/lib/customization'
import { createAgent } from '@/lib/agents'
import { createBinaryStar } from '@/lib/core'
import { createNebula } from '@/lib/nebula'
import type { LearningType } from '@/lib/nebula'
import type { AuthContext } from '@/lib/customization'
import { db } from '@/db'
import { conversations, userSettings, personas as personasTable, injectionAudit, learnings, apiTokens, projects as projectsTable, learningScopes } from '@/db/schema'
import { eq, desc, and, isNull, gte, count, sql } from 'drizzle-orm'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { callProvider, normalizeProviderId } from '@/lib/providers'
import { checkRateLimit } from '@/lib/shell/rate-limit'
const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'
let devUserSeeded = false

async function ensureDevUser() {
    if (devUserSeeded) return
    try {
        await db.execute(
            sql`INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
                VALUES (${DEV_USER_ID}, 'dev@localhost', '{}', '{}', 'authenticated', 'authenticated', now(), now())
                ON CONFLICT (id) DO NOTHING`
        )
        devUserSeeded = true
    } catch (e) {
        console.warn('Dev user seed skipped:', e)
        devUserSeeded = true // Don't retry on failure
    }
}

async function getAuthContext(): Promise<AuthContext> {
    if (process.env.NODE_ENV === 'development') {
        await ensureDevUser()
        const ctx: AuthContext = {
            userId: DEV_USER_ID,
            scopes: ['read:nebula', 'write:nebula', 'write:feedback', 'admin'] as AuthContext['scopes'],
        }
        checkRateLimit(ctx.userId)
        return ctx
    }
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) throw new Error('Unauthorized')
    checkRateLimit(session.user.id)
    return {
        userId: session.user.id,
        scopes: ['read:nebula', 'write:nebula', 'write:feedback', 'admin'],
    }
}

/** Expose userId to client components without exposing full auth context */
export async function getCurrentUserId(): Promise<string> {
    const ctx = await getAuthContext()
    return ctx.userId
}

function getClient(authCtx: AuthContext) {
    return new LocalChorumClient(authCtx)
}

// ==========================================
// Inbox
// ==========================================

export async function approveProposal(proposalId: string) {
    const authCtx = await getAuthContext()
    const nebula = createNebula()
    const binaryStar = createBinaryStar(nebula)
    return binaryStar.approveProposal(proposalId, authCtx.userId)
}

export async function rejectProposal(proposalId: string) {
    const authCtx = await getAuthContext()
    const nebula = createNebula()
    const binaryStar = createBinaryStar(nebula)
    return binaryStar.rejectProposal(proposalId, authCtx.userId)
}

export async function getPendingProposalCount(userId: string) {
    try {
        const nebula = createNebula()
        const binaryStar = createBinaryStar(nebula)
        const proposals = await binaryStar.getProposals(userId)
        return proposals.length
    } catch {
        return 0
    }
}

// ==========================================
// Template Import
// ==========================================

export async function importTemplate(templateName: string): Promise<{ imported: number }> {
    const allowed = ['react-nextjs', 'python', 'creative-writing']
    if (!allowed.includes(templateName)) throw new Error('Unknown template')

    const templatePath = path.join(process.cwd(), 'src', 'lib', 'shell', 'templates', `${templateName}.json`)
    const raw = fs.readFileSync(templatePath, 'utf-8')
    const template = JSON.parse(raw) as {
        name: string
        learnings: { content: string; type: string; scopes: string[] }[]
    }

    const authCtx = await getAuthContext()
    const client = getClient(authCtx)

    let imported = 0
    for (const item of template.learnings) {
        await client.injectLearning({
            userId: authCtx.userId,
            content: item.content,
            type: item.type as any,
            scopes: item.scopes,
            extractionMethod: 'manual',
        })
        imported++
    }
    return { imported }
}

// ==========================================
// API Token Management
// ==========================================

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}

export async function listTokens() {
    const authCtx = await getAuthContext()
    const rows = await db
        .select({
            id: apiTokens.id,
            name: apiTokens.name,
            scopes: apiTokens.scopes,
            lastUsedAt: apiTokens.lastUsedAt,
            expiresAt: apiTokens.expiresAt,
            revokedAt: apiTokens.revokedAt,
            createdAt: apiTokens.createdAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.userId, authCtx.userId))
        .orderBy(desc(apiTokens.createdAt))
    return rows
}

export async function createToken(name: string): Promise<{ token: string; id: string }> {
    const authCtx = await getAuthContext()
    const rawToken = `chorum_${crypto.randomBytes(32).toString('hex')}`
    const hashed = hashToken(rawToken)

    const [row] = await db
        .insert(apiTokens)
        .values({
            userId: authCtx.userId,
            name,
            hashedToken: hashed,
            scopes: ['read:nebula', 'write:nebula', 'write:feedback'],
        })
        .returning()

    if (!row) throw new Error('Failed to create token')
    // Return the raw token ONCE — never stored in plain text again
    return { token: rawToken, id: row.id }
}

export async function revokeToken(tokenId: string): Promise<void> {
    const authCtx = await getAuthContext()
    await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, authCtx.userId)))
}

// ==========================================
// Injection Audit
// ==========================================

export async function getInjectionAudit(limit = 50) {
    const authCtx = await getAuthContext()
    const rows = await db
        .select({
            id: injectionAudit.id,
            conversationId: injectionAudit.conversationId,
            included: injectionAudit.included,
            score: injectionAudit.score,
            reason: injectionAudit.reason,
            excludeReason: injectionAudit.excludeReason,
            tierUsed: injectionAudit.tierUsed,
            tokensUsed: injectionAudit.tokensUsed,
            createdAt: injectionAudit.createdAt,
            learningContent: learnings.content,
            learningType: learnings.type,
            learningId: injectionAudit.learningId,
        })
        .from(injectionAudit)
        .leftJoin(learnings, eq(injectionAudit.learningId, learnings.id))
        .where(eq(injectionAudit.userId, authCtx.userId))
        .orderBy(desc(injectionAudit.createdAt))
        .limit(limit)
    return rows
}

export async function getPendingProposals() {
    const authCtx = await getAuthContext()
    const nebula = createNebula()
    const binaryStar = createBinaryStar(nebula)
    const proposals = await binaryStar.getProposals(authCtx.userId)
    return proposals
}

// ==========================================
// Chat & Conversation Persistence
// ==========================================

export async function startChatSession(initialQuery?: string, projectId?: string) {
    const authCtx = await getAuthContext()

    // Validate projectId ownership if provided
    if (projectId) {
        const proj = await db.query.projects.findFirst({
            where: and(eq(projectsTable.id, projectId), eq(projectsTable.userId, authCtx.userId))
        })
        if (!proj) throw new Error('UNAUTHORIZED')
    }

    const client = getClient(authCtx)
    const res = await client.startSession({ userId: authCtx.userId, initialQuery, contextWindowSize: 8192 })

    // Associate conversation with project and seed scope tags
    if (projectId) {
        const proj = await db.query.projects.findFirst({
            where: eq(projectsTable.id, projectId)
        })
        const sf = proj?.scopeFilter as any
        const scopeTags = sf?.include ?? []
        await db.update(conversations)
            .set({ projectId, scopeTags })
            .where(eq(conversations.id, res.conversationId))
    }

    return res
}

export async function endChatSession(conversationId: string) {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)
    return client.endSession({ userId: authCtx.userId, conversationId })
}

export async function sendChatMessage(
    conversationId: string, message: string, agentId?: string, selectedProvider?: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
) {
    const authCtx = await getAuthContext()
    const agent = createAgent()
    const payload: Record<string, unknown> & { userId: string; conversationId: string; message: string; history: { role: 'user' | 'assistant'; content: string }[]; contextWindowSize: number } = {
        userId: authCtx.userId,
        conversationId,
        message,
        history,
        contextWindowSize: 16000,
    }
    if (agentId) payload.agentId = agentId
    if (selectedProvider) payload.selectedProvider = selectedProvider
    return agent.chatSync(payload)
}

export async function getConversationHistory(limit = 20) {
    const authCtx = await getAuthContext()
    const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, authCtx.userId))
        .orderBy(desc(conversations.startedAt))
        .limit(limit)

    return rows.map(r => ({
        id: r.id,
        updated_at: r.updatedAt.toISOString(),
        metadata: r.metadata as { firstMessageSnippet?: string }
    }))
}

export async function getConversationMessages(conversationId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const row = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId)
    })
    if (!row) return []
    const meta = row.metadata as Record<string, unknown> | null
    return (Array.isArray(meta?.messages) ? meta.messages : []) as { role: 'user' | 'assistant'; content: string }[]
}

export async function saveConversationMessages(
    conversationId: string,
    messages: { role: string; content: string }[]
) {
    const row = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId)
    })
    if (!row) return

    const metadata = (row.metadata as Record<string, unknown>) || {}
    metadata.messages = messages
    const firstMsg = messages[0]
    if (firstMsg && !metadata.firstMessageSnippet) {
        metadata.firstMessageSnippet = firstMsg.content.slice(0, 50) + (firstMsg.content.length > 50 ? '...' : '')
    }

    await db.update(conversations)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId))
}

// ==========================================
// Knowledge & Search
// ==========================================

export async function getKnowledge(scopes?: string[], type?: string) {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)
    return client.readNebula({
        userId: authCtx.userId,
        scopes, type: type as LearningType | undefined, limit: 100, offset: 0,
    })
}

export async function addLearning(content: string, type: LearningType, scopes: string[]) {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)
    return client.injectLearning({
        userId: authCtx.userId, content, type, scopes,
        extractionMethod: 'manual',
    })
}

export async function searchKnowledge(query: string) {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)
    const learningsRaw = await client.readNebula({
        userId: authCtx.userId, limit: 10, offset: 0,
    })
    const allLearnings = Array.isArray(learningsRaw) ? learningsRaw : ((learningsRaw as unknown as Record<string, unknown>).items || []) as unknown[]
    const recentConvs = await getConversationHistory(5)
    // simple substring match for conversations
    const matchedConvs = recentConvs.filter(c =>
        c.metadata?.firstMessageSnippet?.toLowerCase().includes(query.toLowerCase())
    )
    return { learnings: allLearnings, conversations: matchedConvs }
}

// ==========================================
// Feedback
// ==========================================

export async function submitFeedback(
    learningId: string, signal: 'positive' | 'negative',
    conversationId?: string,
) {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)
    return client.submitFeedback({
        userId: authCtx.userId, learningId, signal, conversationId,
        source: 'explicit',
    })
}

// ==========================================
// Settings / Account / Export
// ==========================================

export async function exportAllData() {
    const authCtx = await getAuthContext()
    const client = getClient(authCtx)

    const [learningsRaw, userConvs, userConfigs, userPersonas, userProposals] = await Promise.all([
        client.readNebula({ userId: authCtx.userId, limit: 10000, offset: 0 }),
        getConversationHistory(1000),
        getUserProviders(authCtx.userId),
        getPersonas(authCtx.userId),
        getPendingProposals()
    ])
    const learningsList = Array.isArray(learningsRaw) ? learningsRaw : ((learningsRaw as unknown as Record<string, unknown>).items || [])

    // Strip API keys
    const safeConfigs = userConfigs.map(({ apiKey: _key, ...rest }) => rest)

    return {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        learnings: learningsList,
        conversations: userConvs,
        providerConfigs: safeConfigs,
        personas: userPersonas,
        proposals: userProposals
    }
}

export async function importAllData(data: Record<string, unknown>) {
    const authCtx = await getAuthContext()
    const uid = authCtx.userId

    if (data.version !== '2.0.0') {
        throw new Error('Unsupported export version')
    }

    // Import learnings
    if (data.learnings && Array.isArray(data.learnings)) {
        for (const l of data.learnings) {
            await db.insert(learnings).values({
                id: l.id,
                userId: uid,
                content: l.content,
                type: l.type,
                confidenceBase: l.confidenceBase ?? 0.5,
                confidence: l.confidence ?? 0.5,
                extractionMethod: l.extractionMethod ?? 'manual',
                createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
                updatedAt: l.updatedAt ? new Date(l.updatedAt) : new Date(),
            }).onConflictDoNothing()

            if (l.scopes && Array.isArray(l.scopes)) {
                for (const scope of l.scopes) {
                    await db.insert(learningScopes).values({
                        learningId: l.id,
                        scope
                    }).onConflictDoNothing()
                }
            }
        }
    }

    // Import conversations
    if (data.conversations && Array.isArray(data.conversations)) {
        for (const c of data.conversations) {
            await db.insert(conversations).values({
                id: c.id,
                userId: uid,
                startedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
                metadata: c.metadata ?? {},
            }).onConflictDoNothing()
        }
    }

    // Import personas
    if (data.personas && Array.isArray(data.personas)) {
        for (const p of data.personas) {
            await db.insert(personasTable).values({
                id: p.id,
                userId: uid,
                name: p.name,
                description: p.description ?? '',
                systemPrompt: p.systemPromptTemplate ?? p.systemPrompt ?? '',
                temperature: p.temperature ?? 0.7,
                maxTokens: p.maxTokens ?? 4096,
                isSystem: false,
                isActive: true,
                tier: p.tier ?? null,
            }).onConflictDoNothing()
        }
    }
}

// Using providers logic for connection tests
export async function testProviderConnection(provider: string) {
    const authCtx = await getAuthContext()
    const { getUserProviders } = await import('@/lib/agents')
    const configs = await getUserProviders(authCtx.userId)
    const normalizedProvider = normalizeProviderId(provider)
    const config = configs.find(c => c.provider === normalizedProvider)

    if (!config) return { success: false, error: 'Provider not configured' }

    const start = Date.now()
    try {
        await callProvider(
            {
                provider: config.provider,
                apiKey: config.apiKey,
                model: config.modelOverride ?? 'auto',
                ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
                ...(config.isLocal !== undefined ? { isLocal: config.isLocal } : {}),
            },
            [{ role: 'user', content: 'test' }],
            'Reply with OK',
        )
        return { success: true, latencyMs: Date.now() - start }
    } catch (err) {
        return { success: false, latencyMs: Date.now() - start, error: String(err) }
    }
}

// Re-export Layer 3 (Agents) / Layer 2 (Customization) wrappers securely
import {
    getUserProviders as _getUserProviders,
    saveProviderConfig as _saveProviderConfig,
    disableProvider as _disableProvider,
    deleteProviderConfig as _deleteProviderConfig,
    getPersonas as _getPersonas,
    createPersona as _createPersona,
    deletePersona as _deletePersona
} from '@/lib/agents'

export async function getUserProviders(userId: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _getUserProviders(targetUserId)
}

export async function saveProviderConfig(userId: string, input: any) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _saveProviderConfig(targetUserId, input)
}

export async function disableProvider(userId: string, provider: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _disableProvider(targetUserId, provider)
}

export async function deleteProviderConfig(userId: string, provider: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _deleteProviderConfig(targetUserId, provider)
}

export async function getPersonas(userId: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _getPersonas(targetUserId)
}

export async function createPersona(input: any, userId: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _createPersona(targetUserId, input)
}

export async function deletePersona(id: string, userId: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _deletePersona(id, targetUserId)
}

import {
    getUserCustomization as _getUserCustomization,
    updateUserCustomization as _updateUserCustomization,
    listSeeds as _listSeeds,
    createSeed as _createSeed,
    deleteSeed as _deleteSeed
} from '@/lib/customization'

export async function getUserCustomization(userId: string) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _getUserCustomization(targetUserId)
}

export async function updateUserCustomization(userId: string, input: any) {
    const authCtx = await getAuthContext()
    const targetUserId = userId || authCtx.userId
    if (authCtx.userId !== targetUserId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    return _updateUserCustomization(targetUserId, input)
}

export async function listSeeds() {
    await getAuthContext()
    return _listSeeds()
}

export async function createSeed(input: any) {
    await getAuthContext()
    return _createSeed(input)
}

export async function deleteSeed(name: string) {
    await getAuthContext()
    return _deleteSeed(name)
}

// ==========================================
// Task Provider Config
// ==========================================

export async function getTaskProviderConfig(userId: string) {
    const authCtx = await getAuthContext()
    if (authCtx.userId !== userId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    const cust = await _getUserCustomization(userId)
    return cust.taskProviders ?? {}
}

export async function setTaskProviderConfig(
    userId: string,
    task: 'judge' | 'embedding' | 'extraction' | 'chat',
    config: { provider: string; model?: string; maxTokens?: number; dailyTokenLimit?: number } | null,
) {
    const authCtx = await getAuthContext()
    if (authCtx.userId !== userId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    const current = await _getUserCustomization(userId)
    const taskProviders = { ...(current.taskProviders ?? {}) }
    if (config === null) {
        delete taskProviders[task]
    } else {
        taskProviders[task] = config
    }
    await _updateUserCustomization(userId, { taskProviders })
}

export async function getTaskUsageStats(userId: string) {
    const authCtx = await getAuthContext()
    if (authCtx.userId !== userId && !authCtx.scopes.includes('admin')) throw new Error('Unauthorized')
    const { getTaskUsage } = await import('@/lib/providers/task-router')
    return {
        judge: getTaskUsage(userId, 'judge'),
        embedding: getTaskUsage(userId, 'embedding'),
        extraction: getTaskUsage(userId, 'extraction'),
        chat: getTaskUsage(userId, 'chat'),
    }
}

// ==========================================
// Projects CRUD
// ==========================================

export interface Project {
    id: string
    userId: string
    name: string
    scopeFilter: { include: string[]; exclude: string[] }
    crossLensAccess: boolean
    settings: Record<string, unknown>
    createdAt: string
    updatedAt: string
}

export interface CreateProjectInput {
    name: string
    scopeFilter?: { include: string[]; exclude: string[] }
    crossLensAccess?: boolean
}

export interface UpdateProjectInput {
    name?: string
    scopeFilter?: { include: string[]; exclude: string[] }
    crossLensAccess?: boolean
}

function rowToProject(r: typeof projectsTable.$inferSelect): Project {
    const sf = r.scopeFilter as any
    return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        scopeFilter: {
            include: sf?.include ?? [],
            exclude: sf?.exclude ?? [],
        },
        crossLensAccess: r.crossLensAccess,
        settings: (r.settings as Record<string, unknown>) ?? {},
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
    }
}

export async function getProjects(): Promise<Project[]> {
    const authCtx = await getAuthContext()
    const rows = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.userId, authCtx.userId))
        .orderBy(desc(projectsTable.updatedAt))
    return rows.map(rowToProject)
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
    const authCtx = await getAuthContext()
    const sf = input.scopeFilter ?? { include: [], exclude: [] }
    const [row] = await db
        .insert(projectsTable)
        .values({
            userId: authCtx.userId,
            name: input.name,
            scopeFilter: sf,
            crossLensAccess: input.crossLensAccess ?? false,
        })
        .returning()
    if (!row) throw new Error('Failed to create project')
    return rowToProject(row)
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const authCtx = await getAuthContext()
    const existing = await db.query.projects.findFirst({
        where: and(eq(projectsTable.id, id), eq(projectsTable.userId, authCtx.userId))
    })
    if (!existing) throw new Error('UNAUTHORIZED')

    const patch: Partial<typeof projectsTable.$inferInsert> = { updatedAt: new Date() }
    if (input.name !== undefined) patch.name = input.name
    if (input.scopeFilter !== undefined) patch.scopeFilter = input.scopeFilter
    if (input.crossLensAccess !== undefined) patch.crossLensAccess = input.crossLensAccess

    const [row] = await db
        .update(projectsTable)
        .set(patch)
        .where(eq(projectsTable.id, id))
        .returning()
    if (!row) throw new Error('Failed to update project')
    return rowToProject(row)
}

export async function deleteProject(id: string): Promise<void> {
    const authCtx = await getAuthContext()
    const existing = await db.query.projects.findFirst({
        where: and(eq(projectsTable.id, id), eq(projectsTable.userId, authCtx.userId))
    })
    if (!existing) throw new Error('UNAUTHORIZED')
    await db.delete(projectsTable).where(eq(projectsTable.id, id))
}

export async function getConversationsForProject(projectId: string): Promise<{ id: string; updated_at: string; metadata: { firstMessageSnippet?: string } }[]> {
    const authCtx = await getAuthContext()
    const rows = await db
        .select()
        .from(conversations)
        .where(and(
            eq(conversations.userId, authCtx.userId),
            eq(conversations.projectId, projectId)
        ))
        .orderBy(desc(conversations.updatedAt))
        .limit(50)
    return rows.map(r => ({
        id: r.id,
        updated_at: r.updatedAt.toISOString(),
        metadata: r.metadata as { firstMessageSnippet?: string }
    }))
}

export async function getUnassignedConversations(): Promise<{ id: string; updated_at: string; metadata: { firstMessageSnippet?: string } }[]> {
    const authCtx = await getAuthContext()
    const rows = await db
        .select()
        .from(conversations)
        .where(and(
            eq(conversations.userId, authCtx.userId),
            isNull(conversations.projectId)
        ))
        .orderBy(desc(conversations.updatedAt))
        .limit(20)
    return rows.map(r => ({
        id: r.id,
        updated_at: r.updatedAt.toISOString(),
        metadata: r.metadata as { firstMessageSnippet?: string }
    }))
}

export async function assignConversationToProject(conversationId: string, projectId: string) {
    const authCtx = await getAuthContext()
    // Verify ownership
    const row = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), eq(conversations.userId, authCtx.userId))
    })
    if (!row) throw new Error('Conversation not found')
    await db.update(conversations)
        .set({ projectId, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId))
}

export async function deleteConversation(conversationId: string) {
    const authCtx = await getAuthContext()
    const row = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), eq(conversations.userId, authCtx.userId))
    })
    if (!row) throw new Error('Conversation not found')
    await db.delete(conversations).where(eq(conversations.id, conversationId))
}

// ==========================================
// Nebula Health Stats
// ==========================================

export interface NebulaStats {
    totalLearnings: number
    byType: Record<string, number>
    confidenceDistribution: { bucket: '0–0.2' | '0.2–0.4' | '0.4–0.6' | '0.6–0.8' | '0.8–1.0'; count: number }[]
    topScopes: { scope: string; count: number }[]
    injectionsByDay: { date: string; count: number }[]
}

export async function getNebulaStats(): Promise<NebulaStats> {
    const authCtx = await getAuthContext()
    const uid = authCtx.userId

    const [typeRows, confRows, scopeRows, injRows] = await Promise.all([
        db.execute(sql`
            SELECT type, COUNT(*)::int as count
            FROM learnings WHERE user_id = ${uid}
            GROUP BY type
        `),
        db.execute(sql`
            SELECT
                CASE
                    WHEN confidence < 0.2 THEN '0–0.2'
                    WHEN confidence < 0.4 THEN '0.2–0.4'
                    WHEN confidence < 0.6 THEN '0.4–0.6'
                    WHEN confidence < 0.8 THEN '0.6–0.8'
                    ELSE '0.8–1.0'
                END as bucket,
                COUNT(*)::int as count
            FROM learnings WHERE user_id = ${uid}
            GROUP BY bucket ORDER BY bucket
        `),
        db.execute(sql`
            SELECT ls.scope, COUNT(*)::int as count
            FROM learning_scopes ls
            JOIN learnings l ON l.id = ls.learning_id
            WHERE l.user_id = ${uid}
            GROUP BY ls.scope ORDER BY count DESC LIMIT 8
        `),
        db.execute(sql`
            SELECT DATE(created_at)::text as date, COUNT(*)::int as count
            FROM injection_audit
            WHERE user_id = ${uid}
              AND included = true
              AND created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `),
    ])

    const byType: Record<string, number> = {}
    for (const row of (typeRows as any[])) {
        byType[row.type] = Number(row.count)
    }

    const totalLearnings = Object.values(byType).reduce((a, b) => a + b, 0)

    const BUCKETS = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0'] as const
    const confMap: Record<string, number> = {}
    for (const row of (confRows as any[])) {
        confMap[row.bucket] = Number(row.count)
    }
    const confidenceDistribution = BUCKETS.map(bucket => ({
        bucket,
        count: confMap[bucket] ?? 0,
    }))

    const topScopes = (scopeRows as any[]).map(r => ({
        scope: String(r.scope),
        count: Number(r.count),
    }))

    const injectionsByDay = (injRows as any[]).map(r => ({
        date: String(r.date),
        count: Number(r.count),
    }))

    return { totalLearnings, byType, confidenceDistribution, topScopes, injectionsByDay }
}
