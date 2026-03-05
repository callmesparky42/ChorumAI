import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractLearningsFromHistory } from '@/lib/customization/extraction'

describe('customization/extraction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENAI_API_KEY
    delete process.env.GOOGLE_AI_KEY
  })

  it('returns no extractions for empty history', async () => {
    const result = await extractLearningsFromHistory(
      'user-1',
      'conv-1',
      [],
      undefined,
      async () => ({ proposalCreated: true }),
    )
    expect(result).toEqual([])
  })

  it('extracts a user preference from history', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify([
            { content: 'User prefers tabs over spaces.', type: 'decision', scopes: ['#coding'] },
          ]),
        },
      }],
    }), { status: 200 })))

    const inject = vi.fn().mockResolvedValue({ proposalCreated: true })
    const result = await extractLearningsFromHistory(
      'user-1',
      'conv-1',
      [{ role: 'user', content: 'I prefer tabs over spaces.' }],
      undefined,
      inject,
    )

    expect(result.length).toBe(1)
    expect(result[0]?.content).toContain('prefers tabs')
  })

  it('marks proposalCreated true for auto extraction path', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify([
            { content: 'Always run tests before commit.', type: 'golden_path', scopes: ['#coding'] },
          ]),
        },
      }],
    }), { status: 200 })))

    const result = await extractLearningsFromHistory(
      'user-1',
      'conv-1',
      [{ role: 'user', content: 'I always run tests before commit.' }],
      undefined,
      async () => ({ proposalCreated: true }),
    )

    expect(result[0]?.proposalCreated).toBe(true)
  })

  it('merges scope hints with extracted scopes', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify([
            { content: 'Use limit orders.', type: 'decision', scopes: ['#trading'] },
          ]),
        },
      }],
    }), { status: 200 })))

    const result = await extractLearningsFromHistory(
      'user-1',
      'conv-1',
      [{ role: 'user', content: 'I use limit orders.' }],
      ['#risk'],
      async () => ({ proposalCreated: true }),
    )

    expect(result[0]?.scopes).toEqual(expect.arrayContaining(['#trading', '#risk']))
  })
})
