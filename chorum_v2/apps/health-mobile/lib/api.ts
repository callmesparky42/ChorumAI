import * as SecureStore from 'expo-secure-store'
import type {
  ConfirmUploadRequest,
  ConfirmUploadResponse,
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  ListSnapshotsResponse,
  PresignUploadRequest,
  PresignUploadResponse,
  TrendResult,
} from '@chorum/health-types'

export const API_BASE = 'https://chorumai.com'
export const TOKEN_STORE_KEY = 'chorum_bearer_token'

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_STORE_KEY)
}

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_STORE_KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_STORE_KEY)
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  if (!token) throw new Error('Not authenticated — no bearer token found')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function get<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GET ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function del<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DELETE ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Health API
// ---------------------------------------------------------------------------

export const healthApi = {
  createSnapshot: (req: CreateSnapshotRequest): Promise<CreateSnapshotResponse> =>
    post('/api/health/snapshots', req),

  listSnapshots: (params?: { type?: string; from?: string; to?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.from) qs.set('fromDate', params.from)
    if (params?.to) qs.set('toDate', params.to)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return get<ListSnapshotsResponse>(`/api/health/snapshots${query}`)
  },

  getSnapshots: (params?: { type?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    healthApi.listSnapshots(params),

  presignUpload: (req: PresignUploadRequest): Promise<PresignUploadResponse> =>
    post('/api/health/upload/presign', req),

  confirmUpload: (req: ConfirmUploadRequest): Promise<ConfirmUploadResponse> =>
    post('/api/health/upload/confirm', req),

  getTrends: (type: string, days = 30): Promise<TrendResult> =>
    get(`/api/health/trends?type=${type}&days=${days}`),

  syncGarmin: (): Promise<{ ok: boolean; snapshotsCreated: number }> =>
    post('/api/health/garmin/sync', {}),

  connectGarmin: (username: string, password: string): Promise<{ ok: boolean }> =>
    post('/api/health/garmin/connect', { username, password }),

  registerPushToken: async (token: string): Promise<void> => {
    await post('/api/health/push/register', { token, platform: 'android' })
  },

  unregisterPushToken: async (token: string): Promise<void> => {
    await del('/api/health/push/register', { token })
  },

  triggerOCR: (params: { storageKey: string; snapshotId: string }): Promise<{
    id: string
    documentType: string
    confidence: 'high' | 'medium' | 'low'
    pageCount: number
    pngPages: string[]
  }> =>
    post('/api/health/upload/ocr', params),

  async *streamChat(message: string): AsyncGenerator<string, void, unknown> {
    const token = await getStoredToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/api/health/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        history: [],
      }),
    })

    if (!response.ok) throw new Error(`Chat failed: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue

        const data = line.replace(/^data:\s*/, '')
        if (data === '[DONE]') return

        let parsed: { type?: string; token?: string; message?: string }
        try {
          parsed = JSON.parse(data) as { type?: string; token?: string; message?: string }
        } catch {
          // Ignore malformed frames.
          continue
        }

        if (parsed.type === 'token' && typeof parsed.token === 'string') {
          yield parsed.token
        } else if (parsed.type === 'done') {
          return
        } else if (parsed.type === 'error') {
          throw new Error(parsed.message ?? 'Stream error')
        }
      }
    }
  },

  chat: async (
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<string> => {
    const response = await post<{ content: string }>('/api/health/chat', { message, history })
    return response.content
  },
}
