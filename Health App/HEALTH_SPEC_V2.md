# Chorum Health — Implementation Spec v2

**Status:** Planning
**Supersedes:** `implementation_plan_v1`
**Target:** Android-first health monitoring plugin for Chorum v2 (`chorumai.com`)

---

## Decisions Revised from v1

| # | v1 Decision | v2 Revision | Reason |
|---|-------------|-------------|--------|
| 4 | Supabase Auth for mobile | **Existing bearer token flow** | `authenticate()` already accepts `Authorization: Bearer` headers. Mobile app generates a long-lived token via a one-time Google OAuth on the device — no second auth stack. |
| 5 | Dedicated Supabase branch | **Dedicated Supabase project** | Supabase "branches" are preview environments, not production isolation. PHI requires a separate project with its own connection string and `HEALTH_ENCRYPTION_KEY`. |
| — | Sharp in Edge Function | **Sharp in Node.js runtime** | Sharp uses native bindings — incompatible with Vercel Edge. All health API routes set `export const runtime = 'nodejs'`. |
| — | Upload through API route | **Direct Supabase Storage upload** | Vercel serverless max body is 4.5 MB. ICD TIFFs exceed this. Client gets a signed URL from the API, uploads directly to Supabase Storage, then notifies the API to create the snapshot record. |
| — | garmin-connect (raw) | **garmin-connect + circuit breaker** | Unofficial API breaks without notice. Cron job wraps calls in try/catch, writes failure state to `garmin_sync_state`, alerts after 3 consecutive failures. |

---

## Architecture (Revised)

```
┌─────────────────────────────────────────────────────────────────┐
│  ANDROID APP (React Native Expo)                                │
│  • Google OAuth → Chorum bearer token (expo-secure-store)       │
│  • Health Connect (HR, sleep, steps) — Android 9+ required      │
│  • garmin-connect lib → HRV via server-side cron                │
│  • Camera + ML Kit OCR (on-device, PHI stays local)             │
│  • Signed URL upload → Supabase Storage (bypasses 4.5MB limit)  │
│  • Charts (victory-native / Skia)                               │
│  • Push notifications (Expo Push)                               │
│           │ HTTPS + Bearer JWT                                   │
│           ▼                                                      │
│  CHORUM API (Next.js @ chorumai.com)                            │
│  • /api/health/* — all routes: runtime = 'nodejs'               │
│  • /api/health/upload/presign — signed URL generator            │
│  • /api/health/upload/confirm — post-upload snapshot creation   │
│  • /api/health/snapshots — query + trend routes                 │
│  • /api/health/garmin/* — credential + sync                     │
│  • /api/mcp — +4 health tools                                   │
│  • /api/cron/health-* — garmin sync + weekly checkup            │
│           │                                                      │
│           ▼                                                      │
│  DEDICATED HEALTH SUPABASE PROJECT                              │
│  • health_snapshots (AES-256-GCM encrypted PHI)                 │
│  • health_sources (trusted medical source registry)             │
│  • phi_audit_log (every PHI access)                             │
│  • garmin_sync_state (credentials + sync cursor + circuit state)│
│  • users (copied from core — auth reference only)               │
│           │                                                      │
│           ▼                                                      │
│  WEB DASHBOARD (chorumai.com/health)                            │
│  • Same data, Recharts (already installed in v2)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## New Env Vars Required

| Var | Where | Description |
|-----|-------|-------------|
| `HEALTH_DATABASE_URL` | Vercel + `.env.local` | Dedicated health Supabase project connection string |
| `HEALTH_SUPABASE_URL` | Vercel + `.env.local` | Health project public URL |
| `HEALTH_SUPABASE_SERVICE_KEY` | Vercel only | Health project service role key (server-side only) |
| `HEALTH_ENCRYPTION_KEY` | Vercel only | AES-256-GCM key — `openssl rand -base64 32` — NEVER same as core `ENCRYPTION_KEY` |
| `GARMIN_CRON_SECRET` | Vercel + `.env.local` | Bearer secret for health cron protection |

---

## Phase 1 — Health Foundation

**Goal:** Drizzle schema, PHI encryption, shared types, core snapshot API, health persona. Backend-only — nothing user-facing yet.

### 1.1 — Supabase Project Setup

- [ ] Create dedicated Supabase project for health data
- [ ] Note project ID, connection string, anon key, service role key
- [ ] Add all `HEALTH_*` env vars to Vercel project settings
- [ ] Add `HEALTH_*` vars to `.env.local` (never commit the actual values)

### 1.2 — Workspace Setup

The monorepo has no workspace config. `packages/health-types` needs to be resolvable from both `chorum_v2` and the future `apps/health-mobile`.

- [ ] Add root `package.json` at `ChorumAI/` with:
  ```json
  {
    "name": "chorum-monorepo",
    "private": true,
    "workspaces": ["chorum_v2", "packages/*", "apps/*"]
  }
  ```
- [ ] Create `packages/health-types/package.json` — name `@chorum/health-types`
- [ ] Create `packages/health-types/src/index.ts` with all shared types:
  - `HealthSnapshotType` enum (labs, garmin_daily, garmin_hrv, icd_report, vitals, mychart)
  - `HealthSnapshot` payload shape
  - `GarminDailyPayload`, `GarminHRVPayload`
  - `LabResultPayload`, `ICDReportPayload`
  - API request/response contracts for all health routes
  - Chart data interfaces (per-type, compatible with victory-native + Recharts)
- [ ] Add `@chorum/health-types` as dependency in `chorum_v2/package.json`

### 1.3 — Drizzle Migrations (health project)

Migrations numbered from `0010` in `chorum_v2/drizzle/`:

**`0010_health_schema.sql`**
```sql
-- health_snapshots: append-only PHI store
CREATE TABLE health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,          -- HealthSnapshotType
  recorded_at timestamptz NOT NULL,
  source text NOT NULL,        -- 'garmin' | 'ocr' | 'manual' | 'mychart'
  encrypted_payload text NOT NULL,  -- AES-256-GCM(JSON)
  payload_iv text NOT NULL,
  payload_hash text NOT NULL,  -- SHA-256 for dedup
  storage_path text,           -- Supabase Storage path if file attached
  created_at timestamptz DEFAULT now()
);

-- health_sources: trusted medical knowledge registry
CREATE TABLE health_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  domain text NOT NULL,        -- 'cardiology' | 'labs' | 'general' | etc.
  trust_level int DEFAULT 1,
  active boolean DEFAULT true
);

-- phi_audit_log: HIPAA required
CREATE TABLE phi_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid NOT NULL,       -- who accessed (same as user_id or admin)
  action text NOT NULL,         -- 'view' | 'create' | 'export' | 'decrypt' | 'delete'
  resource_type text NOT NULL,  -- 'snapshot' | 'trend' | 'report'
  resource_id uuid,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- garmin_sync_state: credentials + sync cursor
CREATE TABLE garmin_sync_state (
  user_id uuid PRIMARY KEY,
  encrypted_username text NOT NULL,
  encrypted_password text NOT NULL,
  creds_iv text NOT NULL,
  last_sync_at timestamptz,
  sync_cursor text,              -- last fetched activity/date marker
  consecutive_failures int DEFAULT 0,
  circuit_open boolean DEFAULT false,
  circuit_opened_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**`0010b_health_seed.sql`**
```sql
-- Seed trusted medical sources
INSERT INTO health_sources (name, base_url, domain, trust_level) VALUES
  ('Mayo Clinic', 'https://www.mayoclinic.org', 'general', 3),
  ('Cleveland Clinic', 'https://my.clevelandclinic.org', 'cardiology', 3),
  ('NIH MedlinePlus', 'https://medlineplus.gov', 'general', 3),
  ('NHS', 'https://www.nhs.uk', 'general', 3),
  ('ACC/AHA Guidelines', 'https://www.acc.org', 'cardiology', 3);
```

**`0011_health_rls.sql`**
```sql
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE garmin_sync_state ENABLE ROW LEVEL SECURITY;

-- Users see only their own data
CREATE POLICY "health_snapshots_owner" ON health_snapshots
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "phi_audit_owner" ON phi_audit_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "garmin_sync_owner" ON garmin_sync_state
  FOR ALL USING (user_id = auth.uid());
```

### 1.4 — PHI Encryption Layer

**`src/lib/health/crypto.ts`**

- `encryptPHI(data: object, key: string): { ciphertext: string, iv: string }` — AES-256-GCM, random IV per record, key from `HEALTH_ENCRYPTION_KEY`
- `decryptPHI(ciphertext: string, iv: string, key: string): object`
- `hashPHI(data: object): string` — SHA-256 of canonical JSON for dedup without decryption
- **Key must never be `ENCRYPTION_KEY`** — assert in module init that they differ
- Key rotation path: store `key_version` alongside records for future migration

### 1.5 — Health Persona + Domain Seed

**`0012_health_persona.sql`**

```sql
-- Health Monitor system persona
INSERT INTO personas (name, role, system_prompt, tier, is_system, created_by) VALUES (
  'Health Monitor',
  'Medical data analyst and health advisor',
  '...',  -- composed via composeSystemPrompt()
  'thinking',
  true,
  NULL
);

-- Healthcare domain seed
INSERT INTO domains (name, keywords, description) VALUES (
  'healthcare',
  ARRAY['cardiac', 'HRV', 'labs', 'vitals', 'medication', 'ICD', 'ECG', ...],
  'Medical and health monitoring context'
);
```

Persona properties:
- `corePrinciples`: evidence-based reasoning, de-identified data only, never speculate on diagnosis
- `actions`: analyze trends, compare to reference ranges, flag anomalies, recommend follow-up
- `boundaries`: no diagnosis, no medication recommendations without physician context, always recommend consulting a doctor
- Temperature: 0.3 (low — medical advice must be precise)
- Available tools: `health_trends`, `health_sources`, `health_checkup`

### 1.6 — Core Snapshot API

**`src/app/api/health/snapshots/route.ts`** — `runtime = 'nodejs'`
- `POST /api/health/snapshots` — Create encrypted snapshot; write PHI audit log entry; reject duplicate `payload_hash`
- `GET /api/health/snapshots` — List by `type`, `source`, date range; decrypt server-side; return over TLS; write `view` audit entry

**`src/app/api/health/upload/presign/route.ts`** — `runtime = 'nodejs'`
- Generates Supabase Storage signed upload URL for `health-uploads/{userId}/{uuid}.{ext}`
- Returns `{ uploadUrl, storageKey }` — client uploads directly, then calls `/confirm`

**`src/app/api/health/upload/confirm/route.ts`** — `runtime = 'nodejs'`
- Receives `storageKey` + metadata after client confirms upload
- Creates snapshot record pointing to `storage_path`
- For TIFFs: triggers async TIFF→PNG conversion, updates `storage_path` with PNG pages

**`src/lib/health/tiff.ts`**
- `convertTiffToPng(storageKey: string): Promise<string[]>` — Sharp (Node.js only)
- Downloads TIFF from storage, converts each page to PNG, re-uploads as `{key}_page_{n}.png`
- Returns array of PNG storage paths

### 1.7 — Vitest Tests

- `src/lib/health/__tests__/crypto.test.ts` — roundtrip, IV uniqueness (100 samples), wrong key fails, key version assertion
- `src/lib/health/__tests__/snapshots.test.ts` — append-only behavior, dedup by hash, timeline ordering
- `src/lib/health/__tests__/tiff.test.ts` — mock Sharp, verify page splitting logic

### Validation Checklist — Phase 1

- [ ] `HEALTH_ENCRYPTION_KEY !== ENCRYPTION_KEY` assertion throws on startup
- [ ] `encryptPHI` + `decryptPHI` roundtrip passes for all snapshot types
- [ ] 100 encrypt calls produce 100 unique IVs
- [ ] Duplicate `payload_hash` returns 409, no duplicate record created
- [ ] `phi_audit_log` entry written on every `POST` and `GET` to snapshots
- [ ] TIFF with 3 pages produces 3 PNG files in storage
- [ ] RLS policies prevent cross-user data access
- [ ] All health routes return 401 without valid bearer token or session

---

## Phase 2 — Web Dashboard

**Goal:** `/health` page in the v2 shell. Upload, timeline, vitals overview. Validates the full backend pipeline before mobile.

### 2.1 — MCP Health Tools

**Modify `src/app/api/mcp/route.ts`:**

Add to `MCP_TOOL_MANIFEST`:
```ts
{ name: 'health_snapshot', description: 'Store a point-in-time health data record (labs, vitals, ICD metrics).' },
{ name: 'health_trends',   description: 'Query trend analysis across health snapshot history.' },
{ name: 'health_sources',  description: 'Search trusted medical sources (Mayo Clinic, NIH, etc.) for a health query.' },
{ name: 'health_checkup',  description: 'Trigger an on-demand health analysis using recent data.' },
```

Add to `TOOL_SCOPES`:
```ts
health_snapshot: 'write:nebula',
health_trends:   'read:nebula',
health_sources:  'read:nebula',
health_checkup:  'read:nebula',
```

Add handlers in `src/lib/customization/handlers.ts`.

### 2.2 — Web Health Dashboard

**`src/app/(shell)/health/page.tsx`**

Sections:
- **Vitals strip** — Latest HR, HRV, sleep score, steps (cards, Recharts sparklines)
- **Snapshot timeline** — Chronological list by type; TIFF reports show page thumbnails; labs show parsed key values
- **Upload zone** — Drag-drop + file picker; calls `/presign` then `/confirm`; supported: PDF, PNG, JPG, CSV, TIFF, FIT
- **Chat entry point** — Opens chat with Health Monitor persona pre-selected

Chart types (Recharts — already installed):
- HR over time: `AreaChart`
- HRV: `ScatterChart` + trend `ReferenceLine`
- Sleep stages: `BarChart` stacked
- Lab values: `LineChart` + `ReferenceArea` for normal ranges
- ICD metrics (NSVTs, SVTs, battery): custom annotated timeline component

### 2.3 — TIFF Viewer Component

**`src/components/shell/health/TiffViewer.tsx`**

- Receives array of PNG page URLs (from storage)
- Page navigation (prev/next)
- Zoom: click to expand in modal
- Uses standard `<img>` tags — no special library needed for web

### Validation Checklist — Phase 2

- [ ] Upload a PDF lab result → snapshot created → appears in timeline
- [ ] Upload a 3-page TIFF → 3 PNG pages → TiffViewer shows all pages with navigation
- [ ] HR chart renders from Garmin daily snapshot data
- [ ] MCP `health_checkup` tool returns structured analysis from Health Monitor persona
- [ ] PHI audit log shows `view` entry after timeline load
- [ ] Health page accessible only to authenticated users (shell auth gate)

---

## Phase 3 — Garmin + Cron

**Goal:** Server-side Garmin HRV sync, health trends, weekly checkup notification.

### 3.1 — Garmin Integration

**`src/app/api/health/garmin/connect/route.ts`** — `runtime = 'nodejs'`
- `POST` — Receive Garmin username + password, encrypt with `HEALTH_ENCRYPTION_KEY`, store in `garmin_sync_state`
- Immediately attempt one test fetch to validate credentials before storing

**`src/app/api/cron/health-garmin-sync/route.ts`** — `runtime = 'nodejs'`
- `GARMIN_CRON_SECRET` protected
- Fetch all users with `garmin_sync_state` where `circuit_open = false`
- For each: call `garmin-connect` lib, transform to `GarminDailyPayload` + `GarminHRVPayload`
- Create snapshots; update `last_sync_at` and `sync_cursor`
- On failure: increment `consecutive_failures`; if >= 3, set `circuit_open = true` and `circuit_opened_at`
- Circuit auto-resets after 24h (check on next cron run)
- Add to `vercel.json`: `{ "path": "/api/cron/health-garmin-sync", "schedule": "0 */6 * * *" }`

**`src/lib/health/garmin-transformer.ts`**
- `transformGarminDaily(raw: unknown): GarminDailyPayload` — normalize Garmin's API response to internal schema
- `transformGarminHRV(raw: unknown): GarminHRVPayload`
- Explicit unknown-field handling — Garmin changes their response shape without notice

### 3.2 — Health Trends

**`src/app/api/health/trends/route.ts`** — `runtime = 'nodejs'`
- `GET /api/health/trends?type=hr&days=30` — compute aggregates across snapshots
- Moving averages (7-day, 30-day)
- Anomaly detection: value > 2 SD from 30-day baseline → flag
- Cross-metric correlations: HRV vs sleep quality
- Output consumed by both web dashboard charts and `health_trends` MCP tool

### 3.3 — Weekly Checkup Cron

**`src/app/api/cron/health-checkup/route.ts`** — `runtime = 'nodejs'`
- Runs Monday 8 AM UTC (note to user: adjust schedule for timezone if needed)
- For each user with health data in the past 7 days:
  - Fetch recent snapshots (decrypted)
  - De-identify: strip name, DOB, MRN — retain clinical values only
  - Call Health Monitor persona with de-identified data
  - Parse response for actionable findings
  - Create `health_alert` learning if anomalies found
  - Queue push notification (Phase 4 adds delivery)
- Add to `vercel.json`: `{ "path": "/api/cron/health-checkup", "schedule": "0 8 * * 1" }`

### 3.4 — PHI De-identification

**`src/lib/health/deidentify.ts`** — highest HIPAA risk item; spec explicitly.

Rules (Safe Harbor method, HIPAA §164.514(b)):
- Strip: names, dates (except year), phone, fax, email, SSN, MRN, account numbers, certificate numbers, URLs, IP addresses, photos, biometric identifiers, geographic subdivisions smaller than state
- Retain: clinical values, units, reference ranges, timestamps as relative offsets ("Day 1", "Week 3")
- Pattern replacements:
  ```
  /\b\d{3}-\d{2}-\d{4}\b/  → '[SSN]'
  /\b\d{10,}\b/             → '[ID]'
  /[A-Z][a-z]+ [A-Z][a-z]+/ → '[NAME]'  (heuristic, review)
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/ → '[DATE]'
  ```
- Vitest tests: 20 sample PHI strings must be fully stripped; 20 clinical-only strings must pass through unchanged

### Validation Checklist — Phase 3

- [ ] Garmin connect stores encrypted credentials — plaintext never written to DB
- [ ] Garmin sync cron creates `garmin_daily` + `garmin_hrv` snapshots for test account
- [ ] Circuit breaker opens after 3 consecutive failures, closes after 24h
- [ ] Trends endpoint returns correct 7-day MA for HR dataset
- [ ] Anomaly detection flags HR value 3 SD above baseline
- [ ] De-identifier strips all 18 HIPAA identifiers from test strings
- [ ] De-identifier does not alter `HR: 72 bpm`, `HRV: 45ms`, `K+: 4.1 mEq/L`
- [ ] Weekly checkup produces structured Health Monitor response and logs a learning

---

## Phase 4 — Mobile App Bootstrap

**Goal:** Expo app scaffolded, auth working, Health Connect reading data, basic dashboard.

### 4.1 — Expo Project

**`apps/health-mobile/`** — standalone Expo project, links to `@chorum/health-types` via workspace

Key dependencies:
```
expo ~51
expo-router ~3
expo-secure-store
expo-camera
expo-document-picker
expo-file-system
react-native-health-connect   (Health Connect bridge — not expo-go compatible)
victory-native                (charts via @shopify/react-native-skia)
```

Note: `react-native-health-connect` requires a development build (Expo Go will not work). Testing requires a physical Android 9+ device.

### 4.2 — Mobile Auth Flow

Users do NOT enter an API token manually. Flow:

1. App opens → check `expo-secure-store` for existing bearer token
2. If none: open `WebBrowser` to `chorumai.com/api/auth/mobile-init`
3. `mobile-init` route: initiates Google OAuth (NextAuth), on success generates a long-lived bearer token via `nebula.createApiToken()`, redirects to `chorum://auth?token=...`
4. App receives deep link, stores token in `expo-secure-store`
5. All API calls: `Authorization: Bearer {token}`
6. Optional: biometric re-auth to open app (face/fingerprint via `expo-local-authentication`)

New backend route needed: **`src/app/api/auth/mobile-init/route.ts`**
- Initiates NextAuth Google flow with a `mobile=true` query param
- On callback success: creates a scoped, long-lived API token (`scopes: ['read:nebula', 'write:nebula', 'read:health', 'write:health']`)
- Returns the token via redirect to deep link scheme

Add health scopes to `TokenScope` type in `src/lib/nebula/types.ts`.

### 4.3 — Health Connect Integration

**`apps/health-mobile/lib/health-connect.ts`**

- Request permissions on first launch: `HeartRate`, `SleepSession`, `Steps`, `Distance`
- Permission UX: explain why each permission is needed before requesting
- `readDailyMetrics(date: string): Promise<GarminDailyPayload>` — reads from Health Connect, transforms to shared type
- `syncToChorum(userId: string): Promise<void>` — batch POST to `/api/health/snapshots` (one per day, deduped by hash)
- Background sync: `expo-background-fetch` — sync on app foreground + daily background task

### 4.4 — Basic Dashboard

**`apps/health-mobile/app/(tabs)/dashboard.tsx`**

- Vitals cards: latest HR, HRV, sleep score, steps
- HR area chart (victory-native, last 7 days)
- Sleep stacked bar (last 7 days)
- "Sync now" button → manual trigger of Health Connect sync
- Pull to refresh

### Validation Checklist — Phase 4

- [ ] Google OAuth on physical Android device completes and stores bearer token
- [ ] Deep link `chorum://auth?token=...` handled correctly
- [ ] Health Connect reads HR data from Garmin Connect (via Health Connect sync)
- [ ] Sync sends snapshots to Chorum API, deduplication works (second sync same day = 0 new records)
- [ ] Dashboard charts render on physical device
- [ ] App handles Health Connect permission denial gracefully (no crash)

---

## Phase 5 — Mobile Full Feature

**Goal:** Camera OCR, TIFF viewer, push notifications, full E2E on device.

### 5.1 — Camera OCR

**`apps/health-mobile/components/CameraOCR.tsx`**

- `expo-camera` for capture
- On-device OCR: `@react-native-ml-kit/text-recognition`
- Flow: capture → OCR → display extracted text → user confirms → POST to `/api/health/upload/confirm` with OCR text as payload
- PHI stays on-device during OCR — only de-identified clinical values sent to API
- Supports: MyChart printouts, lab result PDFs photographed, medication labels

### 5.2 — TIFF Viewer (Mobile)

**`apps/health-mobile/components/TiffViewer.tsx`**

- Receives array of PNG URLs (server-converted)
- `expo-image` for display (hardware accelerated)
- Pinch-to-zoom via `react-native-gesture-handler`
- Page navigation with page indicator

### 5.3 — Push Notifications

**`apps/health-mobile/lib/notifications.ts`**

- Register device with `expo-notifications` → store Expo push token in `health_snapshots` user metadata (or new `push_tokens` table)
- Backend: weekly checkup cron sends via Expo Push API
- Notification categories: `health_alert` (anomaly), `weekly_checkup` (routine), `sync_reminder`

New table: **`push_tokens`** in health Supabase project:
```sql
CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text DEFAULT 'android',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

### 5.4 — Upload Sheet

**`apps/health-mobile/components/UploadSheet.tsx`**

Bottom sheet (react-native-bottom-sheet) with options:
- Camera (→ OCR or raw photo)
- File picker (`expo-document-picker`) — PDF, TIFF, CSV, FIT
- Paste text — free-form notes / copy-pasted lab values

### Validation Checklist — Phase 5

- [ ] Camera OCR on MyChart printout extracts at least 80% of lab value rows correctly
- [ ] TIFF upload from file picker → 3-page PNG conversion → viewer shows all pages with pinch zoom
- [ ] Weekly checkup push notification arrives on device within 5 min of cron
- [ ] Notification tap opens relevant section of app
- [ ] Full E2E: phone camera → OCR → snapshot → chart update → web dashboard reflects same data

---

## Phase 6 — HIPAA Hardening + Launch

**Goal:** Audit all PHI paths, rate limiting, auto-logoff, security review.

### 6.1 — Audit Enforcement

- Audit `phi_audit_log` — every code path that decrypts a snapshot must write an audit entry
- Write a lint rule or Vitest integration test that fails if a health route decrypts without calling `logPhiAccess()`
- Add `logPhiAccess()` helper to `src/lib/health/audit.ts` with required fields

### 6.2 — Auto-Logoff

- **Web**: 15-minute idle timer in health routes — implemented in `(shell)/health/layout.tsx`
- **Mobile**: 5-minute background → biometric re-auth required on foreground

### 6.3 — Rate Limiting on Health Routes

Current MCP rate limit: 600/min. Health routes need separate, tighter limits:
- `POST /api/health/snapshots`: 60/min per user
- `POST /api/health/upload/presign`: 20/min per user
- `GET /api/health/trends`: 30/min per user

Use `@upstash/ratelimit` (already used elsewhere in project, if applicable) or Vercel's built-in edge middleware.

### 6.4 — Data Integrity Verification

- On every `GET /api/health/snapshots`: recompute SHA-256 of decrypted payload, compare to stored `payload_hash`
- Tamper detection: if hash mismatch → return 422, write audit log entry with `action: 'integrity_failure'`, do NOT return data

### 6.5 — Security Checklist

- [ ] All 18 HIPAA Safe Harbor identifiers stripped by de-identifier (re-verify with new test cases)
- [ ] `HEALTH_ENCRYPTION_KEY` rotated from any dev/test value before launch
- [ ] Health Supabase project has no public API access — all queries go through service role key server-side
- [ ] `phi_audit_log` RLS policy: users can SELECT but not INSERT, UPDATE, DELETE (writes are service role only)
- [ ] No PHI appears in Vercel logs — verify with log sampling
- [ ] TIFF originals in Supabase Storage bucket: bucket is private, access only via signed URLs with 1-hour expiry
- [ ] Push token table: tokens rotated on re-auth

### Validation Checklist — Phase 6

- [ ] Load test: 1000 snapshot GETs — every response has matching hash
- [ ] Deliberately corrupt one `encrypted_payload` — GET returns 422
- [ ] Run HIPAA checklist against all 18 identifier types
- [ ] 15-min web idle test: session expires, user redirected to `/`
- [ ] Mobile background 5-min test: biometric prompt on return
- [ ] Penetration test (manual): attempt cross-user snapshot access via direct API calls

---

## File Map Summary

```
ChorumAI/
├── packages/
│   └── health-types/
│       ├── package.json        (@chorum/health-types)
│       └── src/index.ts        (all shared types)
├── apps/
│   └── health-mobile/
│       ├── app/
│       │   ├── (tabs)/
│       │   │   ├── dashboard.tsx
│       │   │   ├── upload.tsx
│       │   │   ├── timeline.tsx
│       │   │   └── chat.tsx
│       │   ├── _layout.tsx
│       │   └── login.tsx
│       ├── components/
│       │   ├── VitalsCards.tsx
│       │   ├── HealthCharts.tsx
│       │   ├── CameraOCR.tsx
│       │   ├── TiffViewer.tsx
│       │   ├── UploadSheet.tsx
│       │   └── SnapshotCard.tsx
│       ├── lib/
│       │   ├── api.ts
│       │   ├── health-connect.ts
│       │   ├── auth.ts
│       │   └── notifications.ts
│       ├── app.json
│       └── package.json
└── chorum_v2/
    ├── drizzle/
    │   ├── 0010_health_schema.sql
    │   ├── 0010b_health_seed.sql
    │   ├── 0011_health_rls.sql
    │   └── 0012_health_persona.sql
    ├── src/
    │   ├── app/
    │   │   ├── api/
    │   │   │   ├── auth/mobile-init/route.ts    (Phase 4)
    │   │   │   ├── cron/
    │   │   │   │   ├── health-garmin-sync/route.ts
    │   │   │   │   └── health-checkup/route.ts
    │   │   │   ├── health/
    │   │   │   │   ├── snapshots/route.ts
    │   │   │   │   ├── trends/route.ts
    │   │   │   │   ├── upload/
    │   │   │   │   │   ├── presign/route.ts
    │   │   │   │   │   └── confirm/route.ts
    │   │   │   │   └── garmin/
    │   │   │   │       ├── connect/route.ts
    │   │   │   │       └── sync/route.ts
    │   │   │   └── mcp/route.ts                 (modified: +4 health tools)
    │   │   └── (shell)/health/page.tsx
    │   └── lib/
    │       ├── health/
    │       │   ├── crypto.ts
    │       │   ├── deidentify.ts
    │       │   ├── tiff.ts
    │       │   ├── audit.ts
    │       │   ├── garmin-transformer.ts
    │       │   └── __tests__/
    │       │       ├── crypto.test.ts
    │       │       ├── snapshots.test.ts
    │       │       ├── tiff.test.ts
    │       │       ├── deidentify.test.ts
    │       │       ├── garmin-transformer.test.ts
    │       │       └── trends.test.ts
    │       └── customization/
    │           └── types.ts                     (modified: +health scopes)
    └── vercel.json                              (modified: +2 cron jobs)
```

---

## Open Questions

1. **Timezone for weekly checkup cron** — `0 8 * * 1` is 8 AM UTC. What timezone should this target?
2. **Garmin credential UX** — User enters username/password in the app? Or link via Garmin Connect web? The unofficial lib requires credentials, not OAuth.
3. **Multi-user scope** — Is this personal-only (single user), or should health data eventually be shareable with a clinician/caregiver?
4. **ICD battery % alerting threshold** — Flag at what battery level? (Medtronic typically recommends replacement at RRT indicator, ~ERI.)
5. **FIT file parsing** — The upload route accepts `.fit` files. Is this for direct Garmin activity import? A FIT parser library will be needed (`@garmin/fitdecoder` or `fit-file-parser`).
