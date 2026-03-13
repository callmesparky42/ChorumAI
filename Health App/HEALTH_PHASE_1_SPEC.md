# Health Phase 1 Specification: Foundation — Schema, Encryption, Types, API

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Ready for execution
**Prerequisite:** Chorum v2 live at `chorumai.com` — Phase 5B complete. Supabase health project created (Step 0, human action required).
**Guardian gates:** None inherited — health layer is a new, isolated subsystem. The core `chorum-layer-guardian` does NOT govern health files.

---

## Agent Instructions

You are executing **Health Phase 1** — the foundation of Chorum Health. Your job is to lay every substrate that subsequent phases build on: the dedicated health database, the PHI encryption layer, the shared types package, the snapshot API routes, and the Health Monitor persona. This phase produces nothing user-visible. When Phase 1 is done, a developer can POST a snapshot, see it in the database, and decrypt it. That is all.

Read this document completely before writing a single file. Every decision is locked. If something feels ambiguous, re-read — the answer is here. If it is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. Root `package.json` with workspace configuration
2. `packages/health-types/` — `@chorum/health-types` shared TypeScript package
3. `src/db/health-schema.ts` — Drizzle table definitions for health tables
4. `src/db/health.ts` — Drizzle client pointing at `HEALTH_DATABASE_URL`
5. `drizzle/0010_health_schema.sql` — DDL for health tables
6. `drizzle/0010b_health_seed.sql` — Trusted medical source seed data
7. `drizzle/0011_health_rls.sql` — Row Level Security policies for health tables
8. `drizzle/0012_health_persona.sql` — Health Monitor persona + healthcare domain seed
9. `src/lib/health/crypto.ts` — PHI encryption/decryption/hashing
10. `src/lib/health/audit.ts` — PHI audit log writer
11. `src/lib/health/tiff.ts` — TIFF→PNG conversion (Node.js runtime, Sharp)
12. `src/app/api/health/snapshots/route.ts` — POST + GET snapshot endpoints
13. `src/app/api/health/upload/presign/route.ts` — Signed upload URL generator
14. `src/app/api/health/upload/confirm/route.ts` — Post-upload snapshot creation
15. `src/__tests__/health/crypto.test.ts` — Encryption unit tests
16. `src/__tests__/health/snapshots.test.ts` — Snapshot API unit tests
17. `src/__tests__/health/tiff.test.ts` — TIFF conversion unit tests

**What you will NOT produce:**
- Any UI components or pages — those are Phase 2
- Garmin integration — that is Phase 3
- Trends computation — that is Phase 3
- De-identification logic (`deidentify.ts`) — that is Phase 3 (required before LLM injection)
- Mobile app code — that is Phase 4
- MCP health tools — that is Phase 2 (requires UI validation first)
- Push notification infrastructure — that is Phase 5
- Any modification to `src/db/index.ts`, `src/db/schema.ts`, or any existing Layer 0–5 files
- Any `any` types or `@ts-ignore` comments
- The `garmin_sync_state` table — that is Phase 3

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Full architecture, all phases, open questions |
| Original Plan | `Health App/implementation_plan_v1` | v1 decisions — superseded by HEALTH_SPEC_V2.md where they conflict |
| Chorum DB Pattern | `chorum_v2/src/db/index.ts` | Drizzle client pattern to mirror for health client |
| Chorum Schema Pattern | `chorum_v2/src/db/schema.ts` | Drizzle table definition style to follow |
| Auth Handler | `chorum_v2/src/lib/customization/auth.ts` | `authenticate()` — used unchanged in health API routes |

---

## Step 0: Human Prerequisites (Not Agent Work)

> [!IMPORTANT]
> These actions require human execution before the agent proceeds. They cannot be automated.

### 0.1 — Create Dedicated Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `chorum-health`
3. Region: `us-west-2` (match core project)
4. Note: **Project ID**, **Project URL**, **anon key**, **service role key**, **database password**
5. Connection string format: `postgresql://postgres.[PROJECT_ID]:[DB_PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres`

> This is a **separate project**, not a branch. Health data lives in isolation from Chorum core. Never point `HEALTH_DATABASE_URL` at the same database as `DATABASE_URL`.

### 0.2 — Generate `HEALTH_ENCRYPTION_KEY`

```bash
openssl rand -base64 32
```

Save the output. This key must be different from `ENCRYPTION_KEY`. The encryption module will assert this at startup.

### 0.3 — Add Environment Variables

**Vercel project settings** (chorum-ai-mh8l) → Environment Variables → add all:

| Variable | Value | Environments |
|----------|-------|--------------|
| `HEALTH_DATABASE_URL` | `postgresql://postgres.[ID]:[PASS]@...` | Production, Preview |
| `HEALTH_SUPABASE_URL` | `https://[PROJECT_ID].supabase.co` | Production, Preview |
| `HEALTH_SUPABASE_SERVICE_KEY` | Service role JWT | Production only |
| `HEALTH_ENCRYPTION_KEY` | Generated base64 key | Production only |
| `GARMIN_CRON_SECRET` | `openssl rand -hex 32` | Production, Preview |

**`.env.local`** (do not commit):
```
HEALTH_DATABASE_URL=postgresql://...
HEALTH_SUPABASE_URL=https://...supabase.co
HEALTH_SUPABASE_SERVICE_KEY=eyJ...
HEALTH_ENCRYPTION_KEY=<generated>
GARMIN_CRON_SECRET=<generated>
```

### 0.4 — Install Dependencies

Run from `chorum_v2/`:
```bash
npm install @supabase/supabase-js sharp
```

`sharp` is a native Node.js module — it will not work in Vercel Edge Functions. All routes that import from `src/lib/health/tiff.ts` must declare `export const runtime = 'nodejs'`.

---

## Step 1: Workspace Configuration

**File:** `ChorumAI/package.json` ← root of the monorepo, new file

```json
{
  "name": "chorum-monorepo",
  "private": true,
  "workspaces": [
    "chorum_v2",
    "packages/*",
    "apps/*"
  ]
}
```

> This file only declares workspaces. It has no scripts. `chorum_v2` retains its own `package.json` and is independently deployable to Vercel.

---

## Step 2: Shared Types Package

**Directory:** `ChorumAI/packages/health-types/`

### 2.1 — Package manifest

**File:** `packages/health-types/package.json`

```json
{
  "name": "@chorum/health-types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

### 2.2 — Type definitions

**File:** `packages/health-types/src/index.ts`

```typescript
// ── Snapshot types ──────────────────────────────────────────────────────────

export type HealthSnapshotType =
  | 'garmin_daily'
  | 'garmin_hrv'
  | 'labs'          // was 'lab_result' in original spec — implementation name is authoritative
  | 'icd_report'
  | 'vitals'        // was 'vital_signs'
  | 'mychart'       // was 'mychart_doc'
  | 'checkup_result'  // LLM-generated weekly/longitudinal analysis snapshot

export type HealthSnapshotSource =
  | 'garmin'
  | 'health_connect'
  | 'ocr'
  | 'manual'
  | 'mychart'
  | 'file_upload'

export interface HealthSnapshot {
  id: string
  userId: string
  type: HealthSnapshotType
  recordedAt: string          // ISO 8601
  source: HealthSnapshotSource
  payloadHash: string         // SHA-256 of canonical JSON — for dedup
  storagePath: string | null  // Supabase Storage key if file attached
  createdAt: string
}

// Returned by GET /api/health/snapshots — includes decrypted payload
export interface HealthSnapshotWithPayload extends HealthSnapshot {
  payload: HealthPayload
}

// ── Payload shapes ───────────────────────────────────────────────────────────

export interface GarminDailyPayload {
  date: string                // YYYY-MM-DD
  avgHR: number               // bpm
  restingHR: number           // bpm
  maxHR: number               // bpm
  steps: number
  distanceMeters: number
  activeMinutes: number
  calories: number
  stressLevel: number | null  // 0–100, null if unavailable
}

export interface GarminHRVPayload {
  date: string                // YYYY-MM-DD
  avgHRV: number              // ms (SDNN or RMSSD depending on Garmin model)
  sdnn: number | null         // ms
  rmssd: number | null        // ms
  pnn50: number | null        // percentage
  status: 'balanced' | 'low' | 'unbalanced' | null
}

// > **Implementation note:** The above field names (avgHR, restingHR, etc.) are the spec
// > originals. The `packages/health-types/src/index.ts` implementation uses more explicit
// > names that match Garmin's API terminology:
// >   - `avgHR` → `heartRateAvgBpm`
// >   - `restingHR` → `heartRateRestingBpm`
// >   - `maxHR` → `heartRateMaxBpm`
// >   - `steps` → `stepsTotal`
// >   - `avgHRV` → `hrvRmssdMs`; `rmssd` → also `hrvRmssdMs`; `sdnn`/`pnn50` dropped
// >   - `status` → `hrvStatus`
// >
// > The implementation names are authoritative. Phase 3 `garmin-transformer.ts` and
// > Phase 3 trend extractors use `heartRateAvgBpm`, `stepsTotal`, etc. consistently.

export interface LabResultItem {
  name: string                // e.g. "Potassium", "Hemoglobin"
  value: number
  unit: string                // e.g. "mEq/L", "g/dL"
  refRangeLow: number | null
  refRangeHigh: number | null
  flag: 'H' | 'L' | 'HH' | 'LL' | null  // High, Low, Critical High, Critical Low
}

export interface LabResultPayload {
  reportDate: string          // YYYY-MM-DD
  labName: string             // e.g. "Quest Diagnostics"
  orderingPhysician: null     // always null — PHI stripped at upload
  results: LabResultItem[]
}

export interface ICDReportPayload {
  reportDate: string          // YYYY-MM-DD
  deviceModel: string         // e.g. "Medtronic Cobalt XT HF"
  batteryPct: number          // 0–100
  ertIndicator: boolean       // Elective Replacement Time
  nsVtEpisodes: number        // Non-sustained VT episodes
  svtEpisodes: number         // SVT episodes
  reviewerNotes: string       // extracted text from report, de-identified
  storagePages: string[]      // Supabase Storage paths to converted PNG pages
}

export interface VitalSignsPayload {
  recordedAt: string          // ISO 8601
  systolicBP: number | null   // mmHg
  diastolicBP: number | null  // mmHg
  heartRate: number | null    // bpm
  o2Sat: number | null        // percentage
  temperatureF: number | null
  weightLbs: number | null
  bloodGlucose: number | null // mg/dL
}

export interface OcrDocumentPayload {
  source: string              // e.g. "MyChart printout", "Epic discharge summary"
  rawText: string             // full OCR output — de-identified before storage
  parsedFields: Record<string, string>  // key-value pairs extracted from text
}

export type HealthPayload =
  | GarminDailyPayload
  | GarminHRVPayload
  | LabResultPayload
  | ICDReportPayload
  | VitalSignsPayload
  | OcrDocumentPayload

// ── API contracts ────────────────────────────────────────────────────────────

export interface CreateSnapshotRequest {
  type: HealthSnapshotType
  recordedAt: string
  source: HealthSnapshotSource
  payload: HealthPayload
  storagePath?: string
}

export interface CreateSnapshotResponse {
  id: string
  created: boolean    // false = duplicate (hash matched existing record)
}

export interface ListSnapshotsRequest {
  type?: HealthSnapshotType
  source?: HealthSnapshotSource
  fromDate?: string   // YYYY-MM-DD
  toDate?: string     // YYYY-MM-DD
  limit?: number      // default 50, max 200
  offset?: number
}

export interface ListSnapshotsResponse {
  snapshots: HealthSnapshotWithPayload[]
  total: number
}

export interface PresignUploadRequest {
  filename: string
  contentType: string       // MIME type
  fileSizeBytes: number
}

export interface PresignUploadResponse {
  uploadUrl: string         // signed Supabase Storage URL, 15-min expiry
  storageKey: string        // path in bucket, return this to /confirm
}

export interface ConfirmUploadRequest {
  storageKey: string
  type: HealthSnapshotType
  recordedAt: string
  source: HealthSnapshotSource
  metadata?: Record<string, unknown>   // type-specific parsed fields
}

export interface ConfirmUploadResponse {
  snapshotId: string
  tiffPages?: string[]      // present if TIFF was converted; PNG storage paths
}

// ── Chart data interfaces ────────────────────────────────────────────────────
// Shape-compatible with both victory-native (mobile) and Recharts (web)

export interface HRChartPoint {
  date: string              // YYYY-MM-DD
  avgHR: number
  restingHR: number
  maxHR: number
}

export interface HRVChartPoint {
  date: string
  avgHRV: number
  sdnn: number | null
}

export interface SleepChartPoint {
  date: string
  deepMinutes: number
  remMinutes: number
  lightMinutes: number
  awakeMinutes: number
}

export interface StepsChartPoint {
  date: string
  steps: number
  goal: number              // 10000 default
}

export interface LabValuePoint {
  date: string
  name: string
  value: number
  unit: string
  refLow: number | null
  refHigh: number | null
  flag: string | null
}

export interface ICDTimelinePoint {
  date: string
  nsVt: number
  svt: number
  batteryPct: number
}
```

### 2.3 — Add workspace dependency to `chorum_v2`

In `chorum_v2/package.json`, add to `dependencies`:
```json
"@chorum/health-types": "*"
```

The `"*"` resolves to the local workspace package. No version pinning needed for workspace packages.

---

## Step 3: Health Database Schema

### 3.1 — Drizzle table definitions

**File:** `chorum_v2/src/db/health-schema.ts`

```typescript
// src/db/health-schema.ts
// Health Phase 1: PHI-isolated table definitions for health Supabase project
// IMPORTANT: These tables live in a SEPARATE Supabase project from schema.ts
// Do not import or reference tables from schema.ts here.

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'

// Reference auth.users from the health project's Supabase auth schema
const authSchema = pgSchema('auth')
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

export const healthSnapshots = pgTable('health_snapshots', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  type:             text('type').notNull(),
  recordedAt:       timestamp('recorded_at', { withTimezone: true }).notNull(),
  source:           text('source').notNull(),
  encryptedPayload: text('encrypted_payload').notNull(),
  payloadIv:        text('payload_iv').notNull(),
  payloadHash:      text('payload_hash').notNull(),
  storagePath:      text('storage_path'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const healthSources = pgTable('health_sources', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  baseUrl:    text('base_url').notNull(),
  domain:     text('domain').notNull(),
  trustLevel: integer('trust_level').default(1).notNull(),
  active:     boolean('active').default(true).notNull(),
})

export const phiAuditLog = pgTable('phi_audit_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  actorId:      text('actor_id').notNull(),  // text not uuid — cron jobs pass 'system'
  action:       text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId:   uuid('resource_id'),
  ipAddress:    text('ip_address'),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const pushTokens = pgTable('push_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  token:     text('token').notNull().unique(),
  platform:  text('platform').default('android').notNull(),
  active:    boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 3.2 — Health Drizzle client

**File:** `chorum_v2/src/db/health.ts`

```typescript
// src/db/health.ts
// Drizzle client for the dedicated health Supabase project.
// Uses HEALTH_DATABASE_URL — never DATABASE_URL.
// Import { healthDb } from '@/db/health' in all health API routes.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as healthSchema from './health-schema'

const connectionString = process.env.HEALTH_DATABASE_URL

if (!connectionString) {
  throw new Error('HEALTH_DATABASE_URL is not set. Health routes cannot start.')
}

const client = postgres(connectionString, { prepare: false })

export const healthDb = drizzle(client, { schema: healthSchema })
export type HealthDB = typeof healthDb
```

---

## Step 4: SQL Migrations

Run these migrations against the **health Supabase project**, not the core project.

### 4.1 — Core schema

**File:** `chorum_v2/drizzle/0010_health_schema.sql`

```sql
-- Health Phase 1: Core PHI-isolated tables
-- Run against: HEALTH Supabase project (NOT core project)

-- health_snapshots: append-only encrypted PHI store
CREATE TABLE health_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type               text NOT NULL,
  recorded_at        timestamptz NOT NULL,
  source             text NOT NULL,
  encrypted_payload  text NOT NULL,
  payload_iv         text NOT NULL,
  payload_hash       text NOT NULL,
  storage_path       text,
  created_at         timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT health_snapshots_type_check CHECK (
    type IN ('garmin_daily','garmin_hrv','lab_result','icd_report','vital_signs','mychart_doc','ocr_document')
  ),
  CONSTRAINT health_snapshots_source_check CHECK (
    source IN ('garmin','health_connect','ocr','manual','mychart','file_upload')
  )
);

CREATE INDEX idx_health_snapshots_user_type ON health_snapshots (user_id, type);
CREATE INDEX idx_health_snapshots_user_date ON health_snapshots (user_id, recorded_at DESC);
CREATE UNIQUE INDEX idx_health_snapshots_dedup ON health_snapshots (user_id, payload_hash);

-- health_sources: trusted medical knowledge source registry
CREATE TABLE health_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  base_url    text NOT NULL,
  domain      text NOT NULL,
  trust_level int DEFAULT 1 NOT NULL,
  active      boolean DEFAULT true NOT NULL
);

-- phi_audit_log: HIPAA-required access log
-- Write access is service-role only (enforced by RLS in 0011)
CREATE TABLE phi_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  actor_id      text NOT NULL,   -- text, not uuid: cron jobs write actor_id = 'system'
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  ip_address    text,
  created_at    timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT phi_audit_action_check CHECK (
    action IN ('view','create','export','decrypt','delete','integrity_failure')
  )
);

CREATE INDEX idx_phi_audit_user ON phi_audit_log (user_id, created_at DESC);

-- push_tokens: Expo push notification device tokens (Phase 5 delivery)
CREATE TABLE push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text DEFAULT 'android' NOT NULL,
  active     boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
```

### 4.2 — Medical source seed

**File:** `chorum_v2/drizzle/0010b_health_seed.sql`

```sql
-- Trusted medical source registry seed
INSERT INTO health_sources (name, base_url, domain, trust_level) VALUES
  ('Mayo Clinic',           'https://www.mayoclinic.org',        'general',     3),
  ('Cleveland Clinic',      'https://my.clevelandclinic.org',    'cardiology',  3),
  ('NIH MedlinePlus',       'https://medlineplus.gov',           'general',     3),
  ('NHS',                   'https://www.nhs.uk',                'general',     3),
  ('ACC/AHA Guidelines',    'https://www.acc.org',               'cardiology',  3),
  ('UpToDate',              'https://www.uptodate.com',          'clinical',    3),
  ('NEJM',                  'https://www.nejm.org',              'research',    2),
  ('Heart Rhythm Society',  'https://www.hrsonline.org',         'cardiology',  3);
```

### 4.3 — Row Level Security

**File:** `chorum_v2/drizzle/0011_health_rls.sql`

```sql
-- Health RLS: users see only their own data
-- phi_audit_log: users can SELECT but NOT INSERT/UPDATE/DELETE (service role only writes)

ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi_audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens      ENABLE ROW LEVEL SECURITY;

-- health_snapshots: owner full access
CREATE POLICY "health_snapshots_owner_all"
  ON health_snapshots FOR ALL
  USING (user_id = auth.uid());

-- phi_audit_log: owner can read their own entries only; no writes via RLS
CREATE POLICY "phi_audit_owner_select"
  ON phi_audit_log FOR SELECT
  USING (user_id = auth.uid());
-- Writes go through service role key only — no INSERT/UPDATE/DELETE policy for authenticated users

-- push_tokens: owner full access
CREATE POLICY "push_tokens_owner_all"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid());
```

### 4.4 — Health Monitor persona + domain

**File:** `chorum_v2/drizzle/0012_health_persona.sql`

> [!NOTE]
> This migration runs against the **core** Supabase project, not the health project.
> The persona lives in the core `personas` table alongside other system personas.

```sql
-- Health Monitor system persona
-- Temperature: 0.3 (low — medical responses must be precise)
-- Tier: thinking
-- Tools: health_trends, health_sources, health_checkup (wired in Phase 2)

INSERT INTO personas (
  id,
  name,
  role,
  system_prompt,
  tier,
  is_system,
  temperature,
  max_tokens,
  created_by,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Health Monitor',
  'Medical data analyst and personal health advisor',
  E'You are Chorum''s Health Monitor — a careful, evidence-based medical data analyst.\n\n'
  E'Core principles:\n'
  E'- Base all observations on the data provided. Never speculate beyond it.\n'
  E'- You are not a physician and cannot diagnose conditions or prescribe treatment.\n'
  E'- Always recommend consulting a qualified healthcare provider for clinical decisions.\n'
  E'- Work only with de-identified clinical values. Never reference or store PII.\n'
  E'- When a value is outside reference range, state the deviation clearly and without alarm.\n\n'
  E'What you do:\n'
  E'- Analyze trends across health snapshots (HR, HRV, labs, ICD metrics)\n'
  E'- Compare values to clinical reference ranges and flag deviations\n'
  E'- Identify patterns across multiple data points (improving, stable, declining)\n'
  E'- Surface relevant information from trusted medical sources when asked\n'
  E'- Help interpret ICD device reports (battery status, arrhythmia episode counts)\n\n'
  E'What you never do:\n'
  E'- Diagnose conditions\n'
  E'- Recommend starting, stopping, or adjusting medications\n'
  E'- Make predictions about prognosis\n'
  E'- Reference any patient name, date of birth, MRN, or other identifying information',
  'thinking',
  true,
  0.3,
  4096,
  NULL,
  now(),
  now()
);

-- Healthcare domain seed (core project)
-- Signals to the Conductor that health-domain learnings require their own handling
INSERT INTO domains (name, signal_keywords, description, created_at)
VALUES (
  'healthcare',
  ARRAY[
    'cardiac','cardiology','arrhythmia','HRV','heart rate','ECG','EKG',
    'ICD','pacemaker','defibrillator','NSVT','SVT','AFib','ventricular',
    'labs','CBC','CMP','lipid panel','A1C','glucose','hemoglobin',
    'blood pressure','systolic','diastolic','oxygen saturation','SpO2',
    'medication','dosage','prescription','symptom','diagnosis',
    'Garmin','Health Connect','MyChart','Epic','Medtronic'
  ],
  'Medical data, wearable health metrics, and clinical document analysis',
  now()
)
ON CONFLICT (name) DO NOTHING;
```

---

## Step 5: PHI Encryption Layer

**File:** `chorum_v2/src/lib/health/crypto.ts`

### Contract

```typescript
// Module-level assertion: HEALTH_ENCRYPTION_KEY must differ from ENCRYPTION_KEY.
// Throws on module load if they are the same or if HEALTH_ENCRYPTION_KEY is absent.

export function encryptPHI(data: object): { ciphertext: string; iv: string }
export function decryptPHI(ciphertext: string, iv: string): object
export function hashPHI(data: object): string
```

### Implementation requirements

**`encryptPHI(data: object)`**
- Serialize `data` to canonical JSON (keys sorted — use `JSON.stringify` with a replacer that sorts keys)
- Generate a cryptographically random 16-byte IV via `crypto.getRandomValues()`
- Encrypt using AES-256-GCM with key derived from `HEALTH_ENCRYPTION_KEY` (base64-decoded to 32 bytes)
- Return `{ ciphertext: base64(authTag + ciphertext), iv: base64(iv) }`
- Use Node.js `crypto` module — no external encryption libraries

**`decryptPHI(ciphertext: string, iv: string)`**
- Reverse of `encryptPHI`
- Throws `HealthDecryptionError` (custom error class) if decryption fails
- Never logs the ciphertext or key material

**`hashPHI(data: object)`**
- Same canonical JSON serialization as `encryptPHI`
- Returns hex-encoded SHA-256 hash
- Used for deduplication: two snapshots with the same logical content produce the same hash

**Startup assertion:**
```typescript
const HEALTH_KEY = process.env.HEALTH_ENCRYPTION_KEY
const CORE_KEY = process.env.ENCRYPTION_KEY

if (!HEALTH_KEY) {
  throw new Error('HEALTH_ENCRYPTION_KEY is not set.')
}
if (HEALTH_KEY === CORE_KEY) {
  throw new Error(
    'HEALTH_ENCRYPTION_KEY must not equal ENCRYPTION_KEY. ' +
    'PHI and provider credentials must use separate keys.'
  )
}
```

This assertion runs at module load time — if either condition is true, the health API routes crash on cold start and surface immediately in Vercel logs.

---

## Step 6: PHI Audit Logger

**File:** `chorum_v2/src/lib/health/audit.ts`

### Contract

```typescript
export type PhiAction = 'view' | 'create' | 'export' | 'decrypt' | 'integrity_failure'
export type PhiResourceType = 'snapshot' | 'trend' | 'report' | 'export'

export interface AuditLogEntry {
  userId: string
  actorId: string
  action: PhiAction
  resourceType: PhiResourceType
  resourceId?: string
  ipAddress?: string
}

export async function logPhiAccess(entry: AuditLogEntry): Promise<void>
```

### Implementation requirements

- Uses `healthDb` (the dedicated health Drizzle client) to INSERT into `phi_audit_log`
- Uses the **service role key** for writes — not the user's session. The `phi_audit_log` has no INSERT policy for authenticated users (by design in migration `0011`). Writes go via Supabase client initialized with `HEALTH_SUPABASE_SERVICE_KEY`.
- Writes are **fire-and-forget** — `logPhiAccess` does not await or throw to callers. Audit failures must never block health data operations.
- Implementation: `logPhiAccess` initiates the insert, registers a `.catch()` that writes to `console.error` only, and returns immediately.

```typescript
// Pattern — do not block callers:
export async function logPhiAccess(entry: AuditLogEntry): Promise<void> {
  // initiate without awaiting:
  insertAuditEntry(entry).catch(err =>
    console.error('[phi_audit] Failed to write audit log:', err)
  )
}
```

---

## Step 7: TIFF→PNG Conversion

**File:** `chorum_v2/src/lib/health/tiff.ts`

> [!IMPORTANT]
> This file uses `sharp` — a native Node.js module. Any API route that imports from this file **must** declare `export const runtime = 'nodejs'`. It will fail silently (or loudly) in Edge Functions.

### Contract

```typescript
export async function convertTiffToPng(
  storageKey: string,
  userId: string
): Promise<string[]>
// Returns array of storage paths to converted PNG pages.
// e.g. ['health-uploads/user-id/doc_page_1.png', 'health-uploads/user-id/doc_page_2.png']
// Throws ConversionError if TIFF is unreadable, corrupt, or exceeds 50 pages.
```

### Implementation requirements

- Download the original TIFF from Supabase Storage using `HEALTH_SUPABASE_SERVICE_KEY`
- Use `sharp` to split pages: TIFF files are multi-frame; iterate pages with `sharp(buffer, { page: n })`
- Convert each page to PNG at 150 DPI (sufficient for reading ICD reports; higher DPI not needed)
- Maximum pages: 50. If frame count exceeds 50, throw `ConversionError('TIFF exceeds 50 pages')`
- Upload each page as `health-uploads/${userId}/${baseKey}_page_${n}.png`
- Delete the original TIFF from storage after successful conversion (ICD TIFFs are read-only documents — originals not needed after conversion)
- Return array of PNG storage keys
- If Sharp throws on any page, catch, log, and skip that page — do not abort the entire conversion

---

## Step 8: Snapshot API Routes

All three routes share these constraints:
- `export const runtime = 'nodejs'`
- Auth via `authenticate(request)` from `@/lib/customization/auth` — unchanged from core
- Return 401 for unauthenticated requests
- All PHI access logged via `logPhiAccess` from `src/lib/health/audit.ts`

### 8.1 — Snapshots route

**File:** `chorum_v2/src/app/api/health/snapshots/route.ts`

#### `POST /api/health/snapshots`

Request body: `CreateSnapshotRequest` (from `@chorum/health-types`)

Implementation:
1. Authenticate — 401 if not authenticated
2. Validate request body with Zod schema matching `CreateSnapshotRequest`
3. Hash payload: `hashPHI(body.payload)`
4. Check for duplicate: `SELECT id FROM health_snapshots WHERE user_id = $1 AND payload_hash = $2`
5. If duplicate exists: log `create` audit entry, return `{ id: existing.id, created: false }` with status 200
6. Encrypt payload: `encryptPHI(body.payload)`
7. Insert into `health_snapshots`
8. Log `create` audit entry (fire-and-forget)
9. Return `{ id: newId, created: true }` with status 201

Error handling:
- Zod parse failure → 400 with field errors
- DB write failure → 500, do not expose internal error message

#### `GET /api/health/snapshots`

Query params: `type?`, `source?`, `fromDate?`, `toDate?`, `limit?` (max 200, default 50), `offset?`

Implementation:
1. Authenticate — 401 if not authenticated
2. Build Drizzle query with `where` clauses for each present filter
3. Decrypt each `encrypted_payload` using `decryptPHI(row.encryptedPayload, row.payloadIv)`
4. Log `view` audit entry with `resourceType: 'snapshot'` (fire-and-forget)
5. Return `{ snapshots: HealthSnapshotWithPayload[], total: number }`

If `decryptPHI` throws on any row: skip that row, include it in a `failed` count in the response. Never return partial or corrupt data.

### 8.2 — Upload presign route

**File:** `chorum_v2/src/app/api/health/upload/presign/route.ts`

#### `POST /api/health/upload/presign`

Request body: `PresignUploadRequest`

Allowed MIME types: `image/tiff`, `image/png`, `image/jpeg`, `application/pdf`, `text/csv`, `application/octet-stream` (FIT files)
Max file size: 50 MB

Implementation:
1. Authenticate — 401 if not authenticated
2. Validate `contentType` against allowed list — 400 if not allowed
3. Validate `fileSizeBytes <= 52_428_800` (50 MB) — 400 if exceeded
4. Generate storage key: `health-uploads/${userId}/${crypto.randomUUID()}.${extFromMime(contentType)}`
5. Create Supabase client using `HEALTH_SUPABASE_SERVICE_KEY` and `HEALTH_SUPABASE_URL`
6. Call `supabase.storage.from('health-uploads').createSignedUploadUrl(storageKey, { expiresIn: 900 })` (15 min)
7. Return `PresignUploadResponse`

> The `health-uploads` bucket must be created manually in the health Supabase project as a **private** bucket before this route is called.

### 8.3 — Upload confirm route

**File:** `chorum_v2/src/app/api/health/upload/confirm/route.ts`

#### `POST /api/health/upload/confirm`

Request body: `ConfirmUploadRequest`

Implementation:
1. Authenticate — 401 if not authenticated
2. Validate that `storageKey` starts with `health-uploads/${userId}/` — 403 if it doesn't (prevent cross-user path traversal)
3. Determine if TIFF by checking `storageKey` extension
4. If TIFF: call `convertTiffToPng(storageKey, userId)` — get PNG page paths
   - Set `storagePath` to a JSON-serialized array of PNG paths
5. If not TIFF: `storagePath = storageKey`
6. Build payload based on `type` and `metadata` fields
7. Call `POST /api/health/snapshots` logic inline (or extract to shared `createSnapshot()` function)
8. Return `ConfirmUploadResponse`

If TIFF conversion fails: still create the snapshot with `storagePath = null`, include `tiffError: true` in response so the client can show a warning.

---

## Step 9: Vitest Tests

### 9.1 — Encryption tests

**File:** `chorum_v2/src/__tests__/health/crypto.test.ts`

```typescript
describe('PHI Encryption', () => {
  it('encryptPHI + decryptPHI roundtrip preserves data for all snapshot types')
  it('encryptPHI produces unique IVs across 100 calls with identical input')
  it('decryptPHI throws HealthDecryptionError when IV is tampered')
  it('decryptPHI throws HealthDecryptionError when ciphertext is tampered')
  it('decryptPHI throws HealthDecryptionError when wrong key is used')
  it('hashPHI returns identical output for equivalent objects regardless of key order')
  it('hashPHI returns different output for different objects')
  it('module throws on load when HEALTH_ENCRYPTION_KEY is absent')
  it('module throws on load when HEALTH_ENCRYPTION_KEY equals ENCRYPTION_KEY')
})
```

### 9.2 — Snapshot API tests

**File:** `chorum_v2/src/__tests__/health/snapshots.test.ts`

```typescript
describe('POST /api/health/snapshots', () => {
  it('returns 401 when unauthenticated')
  it('returns 400 when request body is invalid')
  it('creates a snapshot and returns { created: true }')
  it('returns { created: false } on duplicate payload_hash without creating a second row')
  it('writes a phi_audit_log entry on creation')
  it('does not store plaintext payload in health_snapshots')
})

describe('GET /api/health/snapshots', () => {
  it('returns 401 when unauthenticated')
  it('returns decrypted snapshots for authenticated user')
  it('filters by type when type param is provided')
  it('filters by date range when fromDate and toDate are provided')
  it('respects limit and offset params')
  it('writes a phi_audit_log entry on view')
  it('skips and counts rows where decryption fails rather than throwing')
  it('does not return snapshots belonging to a different user')
})
```

### 9.3 — TIFF conversion tests

**File:** `chorum_v2/src/__tests__/health/tiff.test.ts`

```typescript
// Mock sharp and Supabase storage client
describe('convertTiffToPng', () => {
  it('converts a 3-page TIFF to 3 PNG files with correct storage paths')
  it('throws ConversionError when TIFF exceeds 50 pages')
  it('skips a corrupt page and continues converting remaining pages')
  it('deletes the original TIFF from storage after successful conversion')
  it('returns empty array when storage download fails')
})
```

---

## Invariants

1. **`HEALTH_ENCRYPTION_KEY !== ENCRYPTION_KEY`.** The module asserts this at load time. PHI and provider credentials are encrypted under separate keys. This is non-negotiable.

2. **`health_snapshots` is append-only.** There is no `DELETE` or `UPDATE` path for snapshot rows in Phase 1–6. The `UNIQUE INDEX idx_health_snapshots_dedup` on `(user_id, payload_hash)` is the deduplication mechanism. A snapshot's content never changes after creation.

3. **Plaintext PHI never touches the health database.** Only `encrypted_payload` (ciphertext) and `payload_hash` (one-way) are stored. Decryption happens server-side in memory, transmitted over TLS, and never logged.

4. **`phi_audit_log` writes are service-role only.** RLS blocks all INSERT/UPDATE/DELETE via the authenticated user's JWT. Audit entries are written via `HEALTH_SUPABASE_SERVICE_KEY`. If an audit write fails, it is logged to `console.error` and the health operation proceeds — audit failures must never block data access.

5. **All health API routes declare `export const runtime = 'nodejs'`.** The `sharp` dependency and the `crypto` module's `createCipheriv`/`createDecipheriv` require Node.js. Edge Functions will fail.

6. **`healthDb` uses `HEALTH_DATABASE_URL` exclusively.** No health route imports from `@/db` (the core Drizzle client). Cross-contamination between health and core databases is a bug.

7. **Storage paths are user-scoped.** Every storage key begins with `health-uploads/${userId}/`. The confirm route validates this prefix. Any path not matching the authenticated user's ID returns 403.

8. **No `any` types.** All function signatures typed. All Zod schemas match their TypeScript counterparts. All Drizzle query results have typed return shapes.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `HEALTH_DATABASE_URL` not set | `healthDb` module throws on import — cold start fails, logged in Vercel |
| `HEALTH_ENCRYPTION_KEY` absent or equals core key | `crypto.ts` module throws on import — cold start fails |
| Snapshot POST — Zod validation fails | 400 with `{ error: 'validation', fields: [...] }` |
| Snapshot POST — DB write fails | 500 with `{ error: 'internal' }` — no internal message exposed |
| Snapshot GET — decryption fails on a row | Row skipped, `failedCount` incremented in response, 200 still returned |
| TIFF conversion — Sharp fails on a page | Page skipped, logged to `console.error`, conversion continues |
| TIFF conversion — exceeds 50 pages | `ConversionError` thrown, confirm route returns 422 |
| Presign — invalid MIME type | 400 with `{ error: 'unsupported_type' }` |
| Presign — file too large | 400 with `{ error: 'file_too_large', maxBytes: 52428800 }` |
| Confirm — cross-user storage path | 403 — no details in response |
| Audit log write fails | `console.error` only — health operation is not affected |

---

## Completion Criteria

Health Phase 1 is complete when **all** of the following are true:

- [ ] `ChorumAI/package.json` exists with workspace configuration
- [ ] `packages/health-types/src/index.ts` exports all types listed in Step 2
- [ ] `src/db/health-schema.ts` defines all 4 tables with correct column types
- [ ] `src/db/health.ts` exports `healthDb` using `HEALTH_DATABASE_URL`
- [ ] Migrations `0010`, `0010b`, `0011` applied to health Supabase project; tables visible in dashboard
- [ ] Migration `0012` applied to core Supabase project; Health Monitor persona visible in `personas` table
- [ ] `encryptPHI` + `decryptPHI` roundtrip test passes for all 6 payload shapes
- [ ] 100 `encryptPHI` calls on identical input produce 100 unique IVs
- [ ] `HEALTH_ENCRYPTION_KEY === ENCRYPTION_KEY` assertion throws
- [ ] `POST /api/health/snapshots` creates a row where `encrypted_payload` is not the plaintext JSON
- [ ] `GET /api/health/snapshots` returns decrypted payloads matching what was posted
- [ ] Duplicate POST returns `{ created: false }` — `SELECT COUNT(*)` shows 1 row, not 2
- [ ] `phi_audit_log` has one `create` entry and one `view` entry after the above sequence
- [ ] `POST /api/health/upload/presign` returns a signed URL for an allowed MIME type
- [ ] `POST /api/health/upload/presign` returns 400 for a disallowed MIME type
- [ ] TIFF conversion mock test: 3-page input → 3 PNG paths returned
- [ ] TIFF conversion mock test: >50 pages → `ConversionError` thrown
- [ ] All health routes return 401 without a valid bearer token or active session
- [ ] Cross-user path validation: confirm route with another user's storage path → 403
- [ ] `npx next build` from `chorum_v2/` passes with zero type errors
- [ ] `npx vitest run` passes all health tests

---

## What to Defer (Do Not Implement in Phase 1)

| Item | Phase |
|------|-------|
| `/health` web dashboard | 2 |
| MCP health tools | 2 |
| TIFF viewer component | 2 |
| Garmin credential setup | 3 |
| `garmin_sync_state` table | 3 |
| Health trends + moving averages | 3 |
| PHI de-identification (`deidentify.ts`) | 3 |
| Weekly checkup cron | 3 |
| Mobile app scaffold | 4 |
| Mobile auth (`mobile-init` route) | 4 |
| Health Connect integration | 4 |
| Push notification delivery | 5 |
| Circuit breaker for Garmin | 3 |
| Auto-logoff (web + mobile) | 6 |
| Rate limiting on health routes | 6 |
