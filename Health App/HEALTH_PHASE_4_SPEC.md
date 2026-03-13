# Health Phase 4 Specification: Mobile App Bootstrap — Auth, Health Connect, Basic Dashboard

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Ready for execution
**Prerequisite:** Health Phase 1 complete (health DB, crypto, snapshot API live).
**Prerequisite:** Health Phase 3 complete (`garmin-sync.ts` shared module, Garmin routes, crons).
**Prerequisite:** Physical Android 9+ device available for testing. Expo Go WILL NOT work — Health Connect requires a development build.
**Guardian gates:** None inherited — mobile app is a standalone Expo workspace package.

---

## Agent Instructions

You are executing **Health Phase 4** — the Android mobile bootstrap for Chorum Health. Your job is to get the app running on a physical device with real authentication and real health data flowing from Health Connect. When Phase 4 is done, a user can open the app, sign in with Google, grant Health Connect permissions, and see their heart rate, HRV, sleep, and steps on a dashboard that matches the web surface's data.

Read this document completely before writing a single file. Every decision is locked. If something is genuinely missing, flag it as a BLOCKER; do not interpolate.

**What you will produce:**
1. Modify `src/lib/nebula/types.ts` — add `'read:health'` and `'write:health'` to `TokenScope`
2. `src/app/api/auth/mobile-init/route.ts` — OAuth entry point: redirects to Google via NextAuth
3. `src/app/api/auth/mobile-callback/route.ts` — post-auth: creates bearer token, deep-links back to app
4. `apps/health-mobile/package.json` — Expo project manifest
5. `apps/health-mobile/app.json` — Expo config (scheme, permissions, plugins)
6. `apps/health-mobile/tsconfig.json` — TypeScript config (resolves `@chorum/health-types`, `@/*`)
7. `apps/health-mobile/lib/api.ts` — typed Chorum API client (bearer token, all health endpoints)
8. `apps/health-mobile/lib/auth.ts` — auth flow: WebBrowser → deep link → secure-store
9. `apps/health-mobile/lib/health-connect.ts` — Health Connect bridge: permissions, read, sync
10. `apps/health-mobile/app/_layout.tsx` — root layout: auth gate + deep-link handler
11. `apps/health-mobile/app/login.tsx` — sign-in screen
12. `apps/health-mobile/app/(tabs)/_layout.tsx` — tab bar layout (Dashboard, Upload, Timeline, Chat)
13. `apps/health-mobile/app/(tabs)/dashboard.tsx` — vitals cards + HR area chart + sleep bar chart
14. `apps/health-mobile/components/VitalsCards.tsx` — 4 metric cards (HR, HRV, sleep, steps)
15. `apps/health-mobile/components/HealthCharts.tsx` — victory-native chart suite

**What you will NOT produce:**
- Camera OCR (`CameraOCR.tsx`) — that is Phase 5
- TIFF viewer (`TiffViewer.tsx`) — that is Phase 5
- Push notifications — that is Phase 5
- `UploadSheet.tsx` — that is Phase 5
- Full `upload.tsx` and `timeline.tsx` tabs — Phase 5 (create stub tabs in Phase 4)
- `chat.tsx` tab implementation — Phase 5 (stub tab in Phase 4)
- Any modification to `src/lib/health/` or any existing `src/app/api/health/` routes
- Any `any` types — use `unknown` + type guards

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Phase 4 section — auth flow, Health Connect |
| Phase 1 Spec | `Health App/HEALTH_PHASE_1_SPEC.md` | Foundation — snapshot API, bearer token auth |
| Nebula tokens | `chorum_v2/src/lib/nebula/tokens.ts` | `createApiToken()` implementation to call |
| Types | `chorum_v2/src/lib/nebula/types.ts` | `TokenScope` to extend |
| Auth handler | `chorum_v2/src/lib/customization/auth.ts` | `authenticate()` — Bearer token validation |
| Health types | `packages/health-types/src/index.ts` | Shared types used in both mobile + backend |

---

## Step 0: Human Prerequisites (Not Agent Work)

> [!IMPORTANT]
> These require human action before the agent proceeds.

### 0.1 — Register Android Deep Link Scheme

In the Expo app config (`app.json`, Step 3), the deep link scheme is `chorum`. When `mobile-callback` redirects to `chorum://auth?token=...`, Android must know to open the app. This is configured in `app.json` via `scheme: 'chorum'` — Expo handles the Intent Filter registration automatically in the dev build.

No manual Android manifest editing required when using Expo's managed workflow with `expo-linking`.

### 0.2 — Install Expo CLI and Dependencies

Run from `ChorumAI/` monorepo root (or `apps/health-mobile/` after scaffold):
```bash
npm install -g expo-cli @expo/cli
# From apps/health-mobile/ after package.json is created:
npm install
```

### 0.3 — Create Expo Development Build

Health Connect is NOT available in Expo Go. After writing `apps/health-mobile/`:
```bash
cd apps/health-mobile
npx expo prebuild --platform android
npx expo run:android
```

Or use EAS Build:
```bash
npm install -g eas-cli
eas build --platform android --profile development
```

### 0.4 — Enable Health Connect on Test Device

1. Android Settings → Apps → Health Connect → App permissions → grant to the health-mobile app
2. Garmin Connect app must be installed and synced to the same device for Health Connect to receive Garmin data

---

## Step 1: Extend TokenScope (Backend)

**File:** `chorum_v2/src/lib/nebula/types.ts`

Find the `TokenScope` type union and add health scopes:

```typescript
export type TokenScope =
  | 'read:nebula'
  | 'write:nebula'
  | 'write:feedback'
  | 'read:health'
  | 'write:health'
  | 'admin'
```

No other changes to this file. The new scopes will be issued by `mobile-callback` and validated by existing health API routes via `authenticate()`.

**Invariant:** The existing `authenticate()` function in `auth.ts` already validates scopes from stored tokens — adding new scope strings requires no changes to auth logic.

---

## Step 2: Mobile Auth Backend Routes

### 2.1 — Mobile Init Route

**File:** `chorum_v2/src/app/api/auth/mobile-init/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

// Redirect to NextAuth Google sign-in with mobile-callback as the return URL.
// NextAuth validates callbackUrl against NEXTAUTH_URL — mobile-callback is same-origin, safe.

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url)
  const callbackUrl = `${origin}/api/auth/mobile-callback`

  // NextAuth's provider sign-in endpoint with callbackUrl
  const signInUrl = `${origin}/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`

  return NextResponse.redirect(signInUrl)
}
```

### 2.2 — Mobile Callback Route

**File:** `chorum_v2/src/app/api/auth/mobile-callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { createNebula }              from '@/lib/nebula'
import { db }                        from '@/db'
import { mobileAuthCodes }           from '@/db/schema'  // added in Step 2.3 migration
import crypto                        from 'crypto'

const TOKEN_TTL_DAYS = 90
const CODE_TTL_MS    = 5 * 60 * 1000  // one-time code expires in 5 minutes

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url))
  }

  const nebula = createNebula()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS)

  const { token } = await nebula.createApiToken({
    userId:    session.user.id,
    name:      `mobile-${new Date().toISOString().split('T')[0]}`,
    scopes:    ['read:nebula', 'write:nebula', 'read:health', 'write:health'],
    expiresAt,
  })

  // PKCE-style exchange: store the real token under a short-lived random code.
  // The code travels in the deep-link URL; the token never does.
  const code      = crypto.randomBytes(24).toString('hex')
  const codeExpiry = new Date(Date.now() + CODE_TTL_MS)

  await db.insert(mobileAuthCodes).values({
    code,
    token,
    expiresAt: codeExpiry,
  })

  // Deep-link carries the code, not the token
  const deepLink = `chorum://auth?code=${code}`
  return NextResponse.redirect(deepLink)
}
```

### 2.3 — Mobile Token Exchange (PKCE code swap)

**Why:** Android deep-link URLs can appear in system logs (logcat) and be intercepted by another app registered on the same scheme. Putting the 90-day bearer token directly in the URL is a known Android vulnerability. The one-time code expires in 5 minutes and is useless after a single exchange.

**Migration:** Add to the core Supabase project (not health DB):
```sql
-- Run against DATABASE_URL (core project)
CREATE TABLE IF NOT EXISTS mobile_auth_codes (
  code        text PRIMARY KEY,
  token       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false
);
-- Auto-cleanup: delete used or expired codes daily via pg_cron or cron job
CREATE INDEX IF NOT EXISTS mobile_auth_codes_expiry ON mobile_auth_codes (expires_at);
```

**Drizzle schema** (add to `src/db/schema.ts`):
```typescript
export const mobileAuthCodes = pgTable('mobile_auth_codes', {
  code:      text('code').primaryKey(),
  token:     text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used:      boolean('used').notNull().default(false),
})
```

**File:** `src/app/api/auth/mobile-exchange/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db }                        from '@/db'
import { mobileAuthCodes }           from '@/db/schema'
import { eq, and, gt }               from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const body = await req.json() as { code?: string }
  const { code } = body

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }

  const [row] = await db
    .select()
    .from(mobileAuthCodes)
    .where(and(
      eq(mobileAuthCodes.code, code),
      eq(mobileAuthCodes.used, false),
      gt(mobileAuthCodes.expiresAt, new Date()),
    ))
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  // Mark as used — prevents replay attacks
  await db
    .update(mobileAuthCodes)
    .set({ used: true })
    .where(eq(mobileAuthCodes.code, code))

  return NextResponse.json({ token: row.token })
}
```

**Update `apps/health-mobile/lib/auth.ts`:** After catching the deep-link, exchange the code before storing:
```typescript
// In the deep-link handler, replace:
//   const token = params.get('token')
// With:
const code = params.get('code')
if (!code) return

const resp  = await fetch(`${API_BASE}/api/auth/mobile-exchange`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ code }),
})
const { token } = await resp.json() as { token?: string }
if (!token) return

await SecureStore.setItemAsync('auth_token', token)
```

### 2.4 — Token Revocation (lost device)

**File:** `src/app/api/auth/mobile-token/route.ts`
```typescript
// DELETE: revoke the token in the current request's Authorization header.
// Used when user logs out or reports a lost device.
import { NextRequest, NextResponse } from 'next/server'
import { authenticate }              from '@/lib/customization/auth'
import { createNebula }              from '@/lib/nebula'

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Extract raw token from Authorization header to look it up for deletion
  const rawToken = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!rawToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

  const nebula = createNebula()
  await nebula.revokeApiToken({ token: rawToken, userId: auth.userId })

  return NextResponse.json({ revoked: true })
}
```

**In `apps/health-mobile/lib/auth.ts`:** Call this on logout before clearing SecureStore:
```typescript
export async function logout(): Promise<void> {
  const token = await SecureStore.getItemAsync('auth_token')
  if (token) {
    await fetch(`${API_BASE}/api/auth/mobile-token`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {/* best-effort */})
  }
  await SecureStore.deleteItemAsync('auth_token')
}
```

**Security notes:**
- One-time code expires in 5 minutes and is single-use — replay attacks are blocked
- Real bearer token never appears in a URL or system log
- Token revocation closes the lost-device gap — logout from any device invalidates that session
- Token expires after 90 days — refreshable by re-running the mobile-init flow

---

## Step 3: Expo Project Scaffold

### 3.1 — Package Manifest

**File:** `apps/health-mobile/package.json`

```json
{
  "name": "@chorum/health-mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start":   "expo start",
    "android": "expo run:android",
    "build":   "eas build --platform android",
    "prebuild": "expo prebuild"
  },
  "dependencies": {
    "@chorum/health-types":              "*",
    "@shopify/react-native-skia":        "^1.3.0",
    "expo":                              "~51.0.0",
    "expo-constants":                    "~16.0.0",
    "expo-document-picker":              "~12.0.0",
    "expo-file-system":                  "~17.0.0",
    "expo-linking":                      "~6.3.0",
    "expo-local-authentication":         "~14.0.0",
    "expo-router":                       "~3.5.0",
    "expo-secure-store":                 "~13.0.0",
    "expo-web-browser":                  "~13.0.0",
    "react":                             "18.2.0",
    "react-native":                      "0.74.0",
    "react-native-gesture-handler":      "~2.16.0",
    "react-native-health-connect":       "^3.1.0",
    "react-native-reanimated":           "~3.10.0",
    "react-native-safe-area-context":    "4.10.1",
    "react-native-screens":              "3.31.1",
    "victory-native":                    "^41.0.0",
    "lucide-react-native":               "^0.363.0"
  },
  "devDependencies": {
    "@babel/core":      "^7.24.0",
    "@types/react":     "~18.2.0",
    "typescript":       "^5.3.0"
  }
}
```

### 3.2 — Expo Config

**File:** `apps/health-mobile/app.json`

```json
{
  "expo": {
    "name":   "Chorum Health",
    "slug":   "chorum-health",
    "scheme": "chorum",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "android": {
      "package":         "com.chorumai.health",
      "versionCode":     1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0a0a0a"
      },
      "permissions": [
        "android.permission.ACTIVITY_RECOGNITION",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_DISTANCE"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-local-authentication",
        { "faceIDPermission": "Allow Chorum Health to use Face ID for biometric re-auth." }
      ],
      "react-native-health-connect"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

### 3.3 — TypeScript Config

**File:** `apps/health-mobile/tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"],
      "@chorum/health-types": ["../../packages/health-types/src/index.ts"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.d.ts",
    "expo-env.d.ts"
  ]
}
```

---

## Step 4: API Client

**File:** `apps/health-mobile/lib/api.ts`

Single typed client for all Chorum health endpoints. Uses `expo-secure-store` for token retrieval.

```typescript
import * as SecureStore from 'expo-secure-store'
import type {
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  PresignUploadRequest,
  PresignUploadResponse,
  ConfirmUploadRequest,
  ConfirmUploadResponse,
  HealthDashboardData,
  TrendResult,
} from '@chorum/health-types'

const API_BASE = 'https://chorumai.com'
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
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Health API
// ---------------------------------------------------------------------------

export const healthApi = {
  /** Create a health snapshot (Garmin daily, labs, vitals, etc.) */
  createSnapshot: (req: CreateSnapshotRequest): Promise<CreateSnapshotResponse> =>
    post('/api/health/snapshots', req),

  /** List snapshots, optionally filtered by type and date range */
  listSnapshots: (params?: { type?: string; from?: string; to?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.type)  qs.set('type', params.type)
    if (params?.from)  qs.set('from', params.from)
    if (params?.to)    qs.set('to', params.to)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return get<{ snapshots: unknown[]; total: number }>(`/api/health/snapshots${query}`)
  },

  /** Get presigned upload URL for file uploads */
  presignUpload: (req: PresignUploadRequest): Promise<PresignUploadResponse> =>
    post('/api/health/upload/presign', req),

  /** Confirm upload after direct-to-storage PUT */
  confirmUpload: (req: ConfirmUploadRequest): Promise<ConfirmUploadResponse> =>
    post('/api/health/upload/confirm', req),

  /** Get computed trends for a metric type */
  getTrends: (type: string, days = 30): Promise<TrendResult> =>
    get(`/api/health/trends?type=${type}&days=${days}`),

  /** Trigger an on-demand Garmin sync */
  syncGarmin: (): Promise<{ ok: boolean; snapshotsCreated: number }> =>
    post('/api/health/garmin/sync', {}),

  /** Store Garmin credentials */
  connectGarmin: (username: string, password: string): Promise<{ ok: boolean }> =>
    post('/api/health/garmin/connect', { username, password }),
}
```

---

## Step 5: Auth Module

**File:** `apps/health-mobile/lib/auth.ts`

Implements the full mobile auth flow: check stored token → if none, open WebBrowser → handle deep link → store token.

```typescript
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as LocalAuthentication from 'expo-local-authentication'
import { getStoredToken, storeToken, clearToken, TOKEN_STORE_KEY } from '@/lib/api'

const CHORUM_API = 'https://chorumai.com'

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Check if the user has a stored valid bearer token.
 * Does NOT validate the token with the server — that happens on first API call.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getStoredToken()
  return token !== null && token.length > 0
}

/**
 * Sign in via Google OAuth → Chorum bearer token.
 *
 * Flow:
 * 1. Open `chorumai.com/api/auth/mobile-init` in system browser
 * 2. User completes Google OAuth
 * 3. Server redirects to `chorum://auth?token=...`
 * 4. App receives deep link → extract token → store in SecureStore
 *
 * Returns the bearer token on success, null if user cancelled.
 */
export async function signIn(): Promise<string | null> {
  const redirectUri = Linking.createURL('auth')

  const result = await WebBrowser.openAuthSessionAsync(
    `${CHORUM_API}/api/auth/mobile-init`,
    redirectUri,
  )

  if (result.type !== 'success') return null

  // Parse token from deep link: chorum://auth?token=...
  const url    = result.url
  const parsed = Linking.parse(url)
  const token  = parsed.queryParams?.['token']

  if (typeof token !== 'string' || !token) return null

  await storeToken(token)
  return token
}

/**
 * Sign out — clear stored token.
 */
export async function signOut(): Promise<void> {
  await clearToken()
}

// ---------------------------------------------------------------------------
// Biometric re-auth (for app foreground after background)
// ---------------------------------------------------------------------------

export async function biometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync()
  if (!compatible) return false
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  return enrolled
}

/**
 * Prompt for biometric re-auth. Returns true if authenticated.
 * Falls back gracefully if biometrics unavailable.
 */
export async function requireBiometric(): Promise<boolean> {
  const available = await biometricAvailable()
  if (!available) return true   // no biometric → skip (don't block user)

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:       'Verify your identity to continue',
    fallbackLabel:       'Use passcode',
    cancelLabel:         'Cancel',
    disableDeviceFallback: false,
  })

  return result.success
}
```

---

## Step 6: Health Connect Bridge

**File:** `apps/health-mobile/lib/health-connect.ts`

Android Health Connect integration. Reads HR, sleep, steps. Transforms to `GarminDailyPayload` shape for the shared snapshot API.

```typescript
import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect'
import type { GarminDailyPayload } from '@chorum/health-types'
import { healthApi } from '@/lib/api'

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate'    } as const,
  { accessType: 'read', recordType: 'SleepSession' } as const,
  { accessType: 'read', recordType: 'Steps'        } as const,
  { accessType: 'read', recordType: 'Distance'     } as const,
]

export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus()
  return status === SdkAvailabilityStatus.SDK_AVAILABLE
}

/**
 * Initialize Health Connect and request permissions.
 * Must be called from a user-gesture context (button press).
 * Returns true if all required permissions were granted.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  const available = await isHealthConnectAvailable()
  if (!available) return false

  await initialize()
  const granted = await requestPermission(REQUIRED_PERMISSIONS)

  // All 4 permissions must be granted
  return REQUIRED_PERMISSIONS.every(required =>
    granted.some(
      g => g.recordType === required.recordType && g.accessType === required.accessType
    )
  )
}

// ---------------------------------------------------------------------------
// Data reading
// ---------------------------------------------------------------------------

/**
 * Read daily health metrics from Health Connect for a given date.
 * Returns null if Health Connect is unavailable or no data found.
 */
export async function readDailyMetrics(date: string): Promise<GarminDailyPayload | null> {
  try {
    const available = await isHealthConnectAvailable()
    if (!available) return null

    await initialize()

    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay   = new Date(`${date}T23:59:59`)

    const timeRange = {
      operator:  'between' as const,
      startTime: startOfDay.toISOString(),
      endTime:   endOfDay.toISOString(),
    }

    // Read all record types in parallel
    const [heartRateResult, sleepResult, stepsResult, distanceResult] = await Promise.allSettled([
      readRecords('HeartRate', { timeRangeFilter: timeRange }),
      readRecords('SleepSession', { timeRangeFilter: timeRange }),
      readRecords('Steps', { timeRangeFilter: timeRange }),
      readRecords('Distance', { timeRangeFilter: timeRange }),
    ])

    // Aggregate heart rate
    let heartRateAvg: number | null = null
    let heartRateMin: number | null = null
    let heartRateMax: number | null = null

    if (heartRateResult.status === 'fulfilled' && heartRateResult.value.records.length > 0) {
      const allSamples = heartRateResult.value.records.flatMap(
        r => r.samples.map(s => s.beatsPerMinute)
      )
      if (allSamples.length > 0) {
        heartRateAvg = Math.round(allSamples.reduce((s, v) => s + v, 0) / allSamples.length)
        heartRateMin = Math.min(...allSamples)
        heartRateMax = Math.max(...allSamples)
      }
    }

    // Aggregate sleep
    let sleepDurationMinutes: number | null = null

    if (sleepResult.status === 'fulfilled' && sleepResult.value.records.length > 0) {
      const totalMs = sleepResult.value.records.reduce((sum, s) => {
        const start = new Date(s.startTime).getTime()
        const end   = new Date(s.endTime).getTime()
        return sum + (end - start)
      }, 0)
      sleepDurationMinutes = Math.round(totalMs / 60000)
    }

    // Aggregate steps
    let stepsTotal: number | null = null

    if (stepsResult.status === 'fulfilled' && stepsResult.value.records.length > 0) {
      stepsTotal = stepsResult.value.records.reduce((sum, r) => sum + r.count, 0)
    }

    // Aggregate distance
    let distanceMeters: number | null = null

    if (distanceResult.status === 'fulfilled' && distanceResult.value.records.length > 0) {
      distanceMeters = Math.round(
        distanceResult.value.records.reduce((sum, r) => sum + r.distance.inMeters, 0)
      )
    }

    // If no data at all, return null
    if (heartRateAvg === null && stepsTotal === null && sleepDurationMinutes === null) {
      return null
    }

    return {
      date,
      heartRateAvgBpm:      heartRateAvg,
      heartRateRestingBpm:  heartRateMin,    // Health Connect doesn't give resting HR; use min as proxy
      heartRateMaxBpm:      heartRateMax,
      stepsTotal,
      activeCalories:       null,             // not available from Health Connect basic permissions
      totalCalories:        null,
      distanceMeters,
      sleepDurationMinutes,
      sleepScore:           null,             // not available from Health Connect basic permissions
      stressAvg:            null,
      bodyBatteryEnd:       null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Sync the last N days of Health Connect data to Chorum.
 * Uses payload hash deduplication — safe to call multiple times.
 */
export async function syncHealthConnectToChorum(days = 7): Promise<{
  synced: number
  skipped: number
  errors: number
}> {
  let synced = 0, skipped = 0, errors = 0

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]!

    const metrics = await readDailyMetrics(dateStr)
    if (!metrics) { skipped++; continue }

    try {
      await healthApi.createSnapshot({
        type:       'garmin_daily',
        recordedAt: new Date(`${dateStr}T12:00:00`).toISOString(),
        source:     'health_connect',
        payload:    metrics,
      })
      synced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('409') || msg.includes('Duplicate')) {
        skipped++   // dedup — not an error
      } else {
        errors++
      }
    }
  }

  return { synced, skipped, errors }
}
```

---

## Step 7: App Layout + Auth Gate

**File:** `apps/health-mobile/app/_layout.tsx`

```typescript
import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import { storeToken, getStoredToken } from '@/lib/api'
import { isAuthenticated } from '@/lib/auth'

export default function RootLayout() {
  const router   = useRouter()
  const segments = useSegments()
  const [authed, setAuthed] = useState<boolean | null>(null)

  // Check auth on mount
  useEffect(() => {
    isAuthenticated().then(setAuthed)
  }, [])

  // Auth gate: redirect based on auth state
  useEffect(() => {
    if (authed === null) return   // still loading

    const inTabs = segments[0] === '(tabs)'

    if (!authed && inTabs) {
      router.replace('/login')
    } else if (authed && !inTabs) {
      router.replace('/(tabs)/dashboard')
    }
  }, [authed, segments])

  // Deep-link handler: chorum://auth?token=...
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const parsed = Linking.parse(event.url)
      if (parsed.path === 'auth') {
        const token = parsed.queryParams?.['token']
        if (typeof token === 'string' && token) {
          await storeToken(token)
          setAuthed(true)
        }
      }
    }

    const sub = Linking.addEventListener('url', handleUrl)

    // Handle app-open-via-deep-link (cold start)
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url })
    })

    return () => sub.remove()
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login"  />
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}
```

---

## Step 8: Login Screen

**File:** `apps/health-mobile/app/login.tsx`

```typescript
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useState } from 'react'
import { signIn } from '@/lib/auth'
import { useRouter } from 'expo-router'

export default function LoginScreen() {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)

    try {
      const token = await signIn()
      if (token) {
        router.replace('/(tabs)/dashboard')
      } else {
        setError('Sign-in was cancelled. Try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Chorum</Text>
        <Text style={styles.subtitle}>Health Monitor</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.tagline}>AI that learns{'\n'}what works.</Text>
        <Text style={styles.description}>
          Your health data, analyzed by AI that understands your patterns.
        </Text>
      </View>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.signInButton, loading && styles.signInButtonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0a0a0a" />
            : <Text style={styles.signInText}>Continue with Google</Text>
          }
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Your health data is encrypted and never sold.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#0a0a0a', padding: 24 },
  header:               { marginTop: 80 },
  logo:                 { fontSize: 32, fontWeight: '700', color: '#ffffff', letterSpacing: -1 },
  subtitle:             { fontSize: 14, color: '#888888', marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },
  body:                 { flex: 1, justifyContent: 'center' },
  tagline:              { fontSize: 40, fontWeight: '700', color: '#ffffff', lineHeight: 48, letterSpacing: -1 },
  description:          { fontSize: 16, color: '#888888', marginTop: 16, lineHeight: 24 },
  footer:               { paddingBottom: 40 },
  error:                { color: '#ff4444', marginBottom: 16, fontSize: 14 },
  signInButton:         { backgroundColor: '#e0c060', padding: 18, alignItems: 'center' },
  signInButtonDisabled: { opacity: 0.5 },
  signInText:           { color: '#0a0a0a', fontWeight: '700', fontSize: 16 },
  disclaimer:           { color: '#555555', fontSize: 12, textAlign: 'center', marginTop: 16 },
})
```

---

## Step 9: Tab Bar Layout

**File:** `apps/health-mobile/app/(tabs)/_layout.tsx`

```typescript
import { Tabs } from 'expo-router'
import { ActivitySquare, Upload, Clock, MessageCircle } from 'lucide-react-native'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:          false,
        tabBarActiveTintColor: '#e0c060',
        tabBarStyle: {
          backgroundColor:   '#0a0a0a',
          borderTopColor:    '#222222',
          borderTopWidth:    1,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title:        'Dashboard',
          tabBarIcon:   ({ color }) => <ActivitySquare size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title:      'Upload',
          tabBarIcon: ({ color }) => <Upload size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title:      'Timeline',
          tabBarIcon: ({ color }) => <Clock size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title:      'Chat',
          tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} />,
        }}
      />
    </Tabs>
  )
}
```

**Stub tabs (upload, timeline, chat):** Create minimal placeholder screens for Phase 5. Each should render a full-screen `View` with a centered `Text` saying "Coming in Phase 5":

**File:** `apps/health-mobile/app/(tabs)/upload.tsx`
**File:** `apps/health-mobile/app/(tabs)/timeline.tsx`
**File:** `apps/health-mobile/app/(tabs)/chat.tsx`

```typescript
// Same pattern for all three — change the label
import { View, Text, StyleSheet } from 'react-native'

export default function UploadScreen() {
  return (
    <View style={s.container}>
      <Text style={s.label}>Upload</Text>
      <Text style={s.sub}>Coming in Phase 5</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  sub:       { fontSize: 14, color: '#555555', marginTop: 8 },
})
```

---

## Step 10: Dashboard Screen

**File:** `apps/health-mobile/app/(tabs)/dashboard.tsx`

```typescript
import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert
} from 'react-native'
import { VitalsCards } from '@/components/VitalsCards'
import { HealthCharts } from '@/components/HealthCharts'
import { healthApi } from '@/lib/api'
import { requestHealthPermissions, syncHealthConnectToChorum } from '@/lib/health-connect'
import type { TrendResult } from '@chorum/health-types'

interface DashboardData {
  hrTrend:    TrendResult | null
  sleepTrend: TrendResult | null
  stepsTrend: TrendResult | null
}

export default function DashboardScreen() {
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [hrTrend, sleepTrend, stepsTrend] = await Promise.allSettled([
        healthApi.getTrends('hr', 14),
        healthApi.getTrends('sleep', 14),
        healthApi.getTrends('steps', 14),
      ])

      setData({
        hrTrend:    hrTrend.status    === 'fulfilled' ? hrTrend.value    : null,
        sleepTrend: sleepTrend.status === 'fulfilled' ? sleepTrend.value : null,
        stepsTrend: stepsTrend.status === 'fulfilled' ? stepsTrend.value : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const granted = await requestHealthPermissions()
      if (!granted) {
        Alert.alert(
          'Permissions Required',
          'Grant Health Connect access to sync your health data. Go to Settings → Health Connect → App permissions.',
          [{ text: 'OK' }]
        )
        return
      }

      const result = await syncHealthConnectToChorum(7)
      Alert.alert(
        'Sync Complete',
        `${result.synced} new records synced. ${result.skipped} already up to date.`,
        [{ text: 'OK', onPress: loadData }]
      )
    } catch (err) {
      Alert.alert('Sync Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSyncing(false)
    }
  }, [loadData])

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#e0c060" size="large" />
      </View>
    )
  }

  const latestHR    = data?.hrTrend?.points?.at(-1)?.value ?? null
  const latestSleep = data?.sleepTrend?.points?.at(-1)?.value ?? null
  const latestSteps = data?.stepsTrend?.points?.at(-1)?.value ?? null

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#e0c060" />}
    >
      <View style={styles.topBar}>
        <Text style={styles.title}>Health</Text>
        <TouchableOpacity style={styles.syncButton} onPress={handleSync} disabled={syncing}>
          {syncing
            ? <ActivityIndicator size="small" color="#0a0a0a" />
            : <Text style={styles.syncText}>Sync</Text>
          }
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <VitalsCards
        heartRate={latestHR}
        hrv={null}        // HRV comes from Garmin cron — not Health Connect
        sleepMinutes={latestSleep}
        steps={latestSteps}
      />

      {data && (
        <HealthCharts
          hrTrend={data.hrTrend}
          sleepTrend={data.sleepTrend}
          stepsTrend={data.stepsTrend}
        />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0a0a0a' },
  centered:    { alignItems: 'center', justifyContent: 'center' },
  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title:       { fontSize: 28, fontWeight: '700', color: '#ffffff', letterSpacing: -0.5 },
  syncButton:  { backgroundColor: '#e0c060', paddingHorizontal: 16, paddingVertical: 8 },
  syncText:    { color: '#0a0a0a', fontWeight: '700', fontSize: 14 },
  errorBanner: { backgroundColor: '#2a1a1a', margin: 16, padding: 12 },
  errorText:   { color: '#ff6666', fontSize: 13 },
})
```

---

## Step 11: Vitals Cards Component

**File:** `apps/health-mobile/components/VitalsCards.tsx`

```typescript
import { View, Text, StyleSheet } from 'react-native'

interface VitalsCardsProps {
  heartRate:    number | null
  hrv:          number | null
  sleepMinutes: number | null
  steps:        number | null
}

interface MetricCardProps {
  label: string
  value: string
  unit:  string
  color: string
}

function MetricCard({ label, value, unit, color }: MetricCardProps) {
  return (
    <View style={[styles.card, { borderTopColor: color }]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.cardValueRow}>
        <Text style={styles.cardValue}>{value}</Text>
        <Text style={styles.cardUnit}>{unit}</Text>
      </View>
    </View>
  )
}

export function VitalsCards({ heartRate, hrv, sleepMinutes, steps }: VitalsCardsProps) {
  const sleepHours = sleepMinutes !== null
    ? `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m`
    : '—'

  return (
    <View style={styles.grid}>
      <MetricCard
        label="Heart Rate"
        value={heartRate !== null ? String(Math.round(heartRate)) : '—'}
        unit="bpm"
        color="#e05050"
      />
      <MetricCard
        label="HRV"
        value={hrv !== null ? String(Math.round(hrv)) : '—'}
        unit="ms"
        color="#50b0e0"
      />
      <MetricCard
        label="Sleep"
        value={sleepHours}
        unit=""
        color="#7050e0"
      />
      <MetricCard
        label="Steps"
        value={steps !== null ? steps.toLocaleString() : '—'}
        unit=""
        color="#50e070"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    padding:        12,
    gap:            12,
  },
  card: {
    width:          '47%',
    backgroundColor: '#111111',
    padding:        16,
    borderTopWidth: 2,
  },
  cardLabel:    { fontSize: 11, color: '#888888', letterSpacing: 1, textTransform: 'uppercase' },
  cardValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 4 },
  cardValue:    { fontSize: 28, fontWeight: '700', color: '#ffffff' },
  cardUnit:     { fontSize: 13, color: '#666666' },
})
```

---

## Step 12: Health Charts Component

**File:** `apps/health-mobile/components/HealthCharts.tsx`

Uses `victory-native` with `@shopify/react-native-skia` for GPU-accelerated charts.

```typescript
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import {
  CartesianChart,
  Area,
  Bar,
  useChartPressState,
} from 'victory-native'
import { LinearGradient, vec } from '@shopify/react-native-skia'
import type { TrendResult } from '@chorum/health-types'

const SCREEN_WIDTH = Dimensions.get('window').width
const CHART_WIDTH  = SCREEN_WIDTH - 32
const CHART_HEIGHT = 160

interface HealthChartsProps {
  hrTrend:    TrendResult | null
  sleepTrend: TrendResult | null
  stepsTrend: TrendResult | null
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={[styles.emptyChart, { width: CHART_WIDTH, height: CHART_HEIGHT }]}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  )
}

export function HealthCharts({ hrTrend, sleepTrend, stepsTrend }: HealthChartsProps) {
  return (
    <View style={styles.container}>
      {/* Heart Rate — Area chart */}
      <ChartSection title="Heart Rate (14 days)">
        {!hrTrend || hrTrend.points.length === 0 ? (
          <EmptyChart message="No heart rate data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={hrTrend.points}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, bottom: 10 }}
            axisOptions={{
              font:          null,
              labelColor:    '#555555',
              lineColor:     '#222222',
              tickCount:     { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Area
                points={points['value']!}
                y0={chartBounds.bottom}
                color="#e05050"
                opacity={0.8}
              >
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, CHART_HEIGHT)}
                  colors={['#e05050aa', '#e0505000']}
                />
              </Area>
            )}
          </CartesianChart>
        )}
      </ChartSection>

      {/* Sleep — Bar chart */}
      <ChartSection title="Sleep Duration (14 days)">
        {!sleepTrend || sleepTrend.points.length === 0 ? (
          <EmptyChart message="No sleep data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={sleepTrend.points.map(p => ({
              ...p,
              value: Math.round(p.value / 60 * 10) / 10,   // convert minutes to hours
            }))}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, left: 10, right: 10 }}
            axisOptions={{
              font:       null,
              labelColor: '#555555',
              lineColor:  '#222222',
              tickCount:  { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Bar
                points={points['value']!}
                chartBounds={chartBounds}
                color="#7050e0"
                roundedCorners={{ topLeft: 2, topRight: 2 }}
              />
            )}
          </CartesianChart>
        )}
      </ChartSection>

      {/* Steps — Bar chart */}
      <ChartSection title="Daily Steps (14 days)">
        {!stepsTrend || stepsTrend.points.length === 0 ? (
          <EmptyChart message="No steps data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={stepsTrend.points}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, left: 10, right: 10 }}
            axisOptions={{
              font:       null,
              labelColor: '#555555',
              lineColor:  '#222222',
              tickCount:  { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Bar
                points={points['value']!}
                chartBounds={chartBounds}
                color="#50e070"
                roundedCorners={{ topLeft: 2, topRight: 2 }}
              />
            )}
          </CartesianChart>
        )}
      </ChartSection>
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { paddingHorizontal: 16, paddingBottom: 32 },
  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 13, color: '#888888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  emptyChart:   { backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: '#444444', fontSize: 13 },
})
```

---

## Validation Checklist — Phase 4

### Backend
- [ ] `TokenScope` in `types.ts` includes `'read:health'` and `'write:health'`
- [ ] `GET /api/auth/mobile-init` redirects to NextAuth Google sign-in (verify in browser)
- [ ] After successful Google sign-in, `mobile-callback` creates an API token with health scopes in the DB
- [ ] `mobile-callback` redirects to `chorum://auth?token=...`
- [ ] Token record in `api_tokens` table has `scopes: ["read:nebula","write:nebula","read:health","write:health"]`
- [ ] Existing health API routes (`/api/health/snapshots`, `/api/health/trends`) return 200 with the bearer token

### Auth Flow (Physical Device)
- [ ] App opens login screen when no token stored
- [ ] "Continue with Google" opens system browser at `chorumai.com/api/auth/mobile-init`
- [ ] Google OAuth completes successfully
- [ ] App receives `chorum://auth?token=...` deep link and navigates to dashboard
- [ ] Token persists across app restarts (stored in SecureStore)
- [ ] Second app open skips login → directly to dashboard

### Health Connect
- [ ] `requestHealthPermissions()` shows Health Connect permission dialog
- [ ] After granting, `readDailyMetrics(today)` returns non-null object for a device with Garmin data
- [ ] "Sync" button on dashboard calls `syncHealthConnectToChorum(7)` and shows alert with count
- [ ] Running sync twice same day: second run shows `0 synced, N already up to date`

### Dashboard
- [ ] Vitals cards render with values (or `—` gracefully when no data)
- [ ] HR area chart renders with 14 days of data points
- [ ] Sleep bar chart renders (values in hours, not minutes)
- [ ] Steps bar chart renders
- [ ] Pull-to-refresh reloads all trend data
- [ ] No crashes or unhandled promise rejections in Metro logs

### Build
- [ ] `npx expo prebuild --platform android` completes without errors
- [ ] `npx expo run:android` installs and launches on physical device
- [ ] Health Connect permission appears in Android App Settings for `com.chorumai.health`

---

## Architecture Notes

### Why `mobile-init` + `mobile-callback` instead of Supabase Auth

The existing `authenticate()` in `auth.ts` validates NextAuth sessions AND Bearer tokens — it was already built for this. Using a separate Supabase Auth stack for mobile would mean two auth systems with two token flows, two session types, and two places to check auth in every API route. The `mobile-init` route simply wraps the existing NextAuth Google provider and issues a long-lived token via the existing `createApiToken()`. No new auth infrastructure needed.

### Why Health Connect data is typed as `garmin_daily`

Health Connect data is stored with `type: 'garmin_daily'` because the payload shape matches `GarminDailyPayload` — both provide heart rate, steps, sleep duration, and distance. This means Health Connect data flows through the same trend computation, anomaly detection, and dashboard charts as server-side Garmin data. The `source` field distinguishes them: `'garmin'` for server-side sync, `'manual'` for Health Connect bridge. Trend queries don't filter by source — all `garmin_daily` records contribute regardless of origin.

### Why HRV is null in Health Connect data

Android Health Connect's standard `HeartRateVariability` record type requires `android.permission.health.READ_HEART_RATE_VARIABILITY` which is a restricted permission not available to third-party apps in Health Connect v1. HRV comes only from the server-side Garmin sync cron. The Vitals card shows `—` for HRV until Phase 3's Garmin cron has run.

### Victory-native vs Recharts

Web dashboard uses Recharts (React DOM). Mobile uses `victory-native` with `@shopify/react-native-skia` — GPU-accelerated, same chart API concepts, different renderer. The `@chorum/health-types` `TrendResult` shape is consumed identically by both.
