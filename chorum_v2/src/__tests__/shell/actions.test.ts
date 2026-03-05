import { describe, it, expect, vi } from 'vitest'

// Mock dependencies before importing actions
vi.mock('next-auth/next', () => ({
    getServerSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } })
}))

vi.mock('@/lib/auth', () => ({
    authOptions: {}
}))

vi.mock('@/lib/customization', () => ({
    LocalChorumClient: class {
        readNebula = vi.fn().mockResolvedValue({ items: [] })
        startSession = vi.fn().mockResolvedValue({ session: '123' })
        injectLearning = vi.fn().mockResolvedValue({ success: true })
    }
}))

vi.mock('@/lib/core', () => ({
    createBinaryStar: vi.fn().mockReturnValue({
        getProposals: vi.fn().mockResolvedValue([{ id: 'p1', type: 'promote' }])
    }),
    createNebula: vi.fn()
}))

vi.mock('@/db', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([])
    }
}))

vi.mock('drizzle-orm', () => ({
    eq: vi.fn(),
    desc: vi.fn()
}))

vi.mock('@/db/schema', () => ({
    conversations: { id: 'id', userId: 'userId', startedAt: 'startedAt' },
    userSettings: {},
    personas: {}
}))

import { getPendingProposals, startChatSession } from '../../lib/shell/actions'

describe('Shell Actions', () => {
    it('getPendingProposals fetches from binary star', async () => {
        const proposals = await getPendingProposals()
        expect(proposals).toBeDefined()
        expect(proposals.length).toBe(1)
        expect(proposals[0]!.id).toBe('p1')
    })

    it('startChatSession initializes local client', async () => {
        const res = await startChatSession('hello')
        expect(res).toBeDefined()
        expect((res as any).session).toBe('123')
    })
})
