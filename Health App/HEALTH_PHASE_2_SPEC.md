# Health Phase 2 Specification: Web Dashboard — Charts, Timeline, Upload, MCP Tools

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Ready for execution
**Prerequisite:** Health Phase 1 complete — all snapshots API routes live, migrations applied to both Supabase projects, `healthDb` operational.
**Guardian gates:** Shell layer contract: health server actions must not import from `src/lib/nebula/`, `src/lib/core/`, or `src/lib/customization/`. Health logic stays in `src/lib/health/` and `src/lib/shell/health-actions.ts`.

---

## Agent Instructions

You are executing **Health Phase 2** — the first user-visible surface for Chorum Health. This phase produces the `/health` dashboard page inside the existing shell, four MCP tools for external AI clients, and the nav entry that connects everything.

Read this document completely before writing a single file. Every decision is locked. If something feels ambiguous, re-read — the answer is here. If it is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. Amendment to `packages/health-types/src/index.ts` — add `sleepScore` and `sleepDurationMinutes` to `GarminDailyPayload`; add dashboard-specific types
2. `src/lib/shell/health-actions.ts` — server actions for the health dashboard
3. `src/app/(shell)/health/page.tsx` — server component, health dashboard root
4. `src/components/shell/health/VitalsStrip.tsx` — latest metrics row (server component)
5. `src/components/shell/health/HealthCharts.tsx` — Recharts chart suite (client component)
6. `src/components/shell/health/SnapshotTimeline.tsx` — chronological snapshot list (server component)
7. `src/components/shell/health/UploadZone.tsx` — drag-drop uploader with presign→upload→confirm flow (client component)
8. `src/components/shell/health/TiffViewer.tsx` — paginated PNG viewer (client component)
9. Modify `src/components/shell/ShellSidebar.tsx` — add Health nav entry
10. Modify `src/app/api/mcp/route.ts` — register 4 health tools
11. `src/lib/customization/health-handlers.ts` — MCP health tool handler implementations
12. `src/__tests__/health/health-actions.test.ts` — server action tests
13. `src/__tests__/health/health-handlers.test.ts` — MCP handler tests

**What you will NOT produce:**
- Garmin sync UI or any Garmin-specific setup flow — that is Phase 3
- PHI de-identification — that is Phase 3
- `health_checkup` LLM analysis — Phase 2 stub returns structured data only; full analysis in Phase 3
- Moving averages or anomaly detection in charts — Phase 3
- Mobile components of any kind — Phase 4
- Push notification UI — Phase 5
- Any new database migrations — Phase 1 schema is complete
- Any modification to `src/lib/health/crypto.ts`, `src/lib/health/audit.ts`, `src/lib/health/tiff.ts`, or any of the `src/app/api/health/` routes
- Any `any` types or `@ts-ignore` comments

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Full architecture, all phases |
| Health Phase 1 Spec | `Health App/HEALTH_PHASE_1_SPEC.md` | Foundation — what already exists |
| Layer Contracts | `chorum_v2/docs/specs/LAYER_CONTRACTS.md` | Shell must stay stateless |
| Phase 5B Spec | `chorum_v2/PHASE_5B_SPEC.md` | Shell pattern reference — same aesthetic |
| ShellSidebar | `chorum_v2/src/components/shell/ShellSidebar.tsx` | Exact nav pattern to extend |
| MCP Route | `chorum_v2/src/app/api/mcp/route.ts` | Exact extension pattern |

---

## Step 0: Type Package Amendment

**File:** `packages/health-types/src/index.ts` — amend `GarminDailyPayload` and add dashboard types.

### Amendment to `GarminDailyPayload`

Add two fields. The existing definition gains:

```typescript
export interface GarminDailyPayload {
  date: string
  avgHR: number
  restingHR: number
  maxHR: number
  steps: number
  distanceMeters: number
  activeMinutes: number
  calories: number
  stressLevel: number | null
  sleepScore: number | null          // ADD — Garmin Body Battery sleep score 0–100
  sleepDurationMinutes: number | null  // ADD — total sleep time in minutes
}
```

### New dashboard types

Add to end of `packages/health-types/src/index.ts`:

```typescript
// ── Dashboard types ──────────────────────────────────────────────────────────

export interface LatestVitalValue {
  value: number
  unit: string
  recordedAt: string    // ISO 8601
}

export interface LatestVitals {
  restingHR: LatestVitalValue | null
  avgHRV: LatestVitalValue | null
  steps: LatestVitalValue | null
  sleepScore: LatestVitalValue | null
  systolicBP: LatestVitalValue | null
  diastolicBP: LatestVitalValue | null
  lastSnapshotAt: string | null
}

export interface SnapshotSummary {
  id: string
  type: HealthSnapshotType
  source: HealthSnapshotSource
  recordedAt: string
  summary: string               // human-readable, computed server-side
  storagePath: string | null
  tiffPageUrls: string[] | null // signed read URLs (1-hour expiry) for TIFF PNG pages
  flagCount: number             // count of flagged lab values; 0 for non-lab types
}

export interface HealthDashboardData {
  vitals: LatestVitals
  hrChart: HRChartPoint[]        // last 14 days
  hrvChart: HRVChartPoint[]      // last 14 days
  sleepChart: SleepChartPoint[]  // last 14 days
  stepsChart: StepsChartPoint[]  // last 14 days
  recentSnapshots: SnapshotSummary[]  // last 20, all types
  totalSnapshots: number
}
```

---

## Step 1: Health Server Actions

**File:** `chorum_v2/src/lib/shell/health-actions.ts`

Top of file: `'use server'`

These actions run server-side only. They import directly from `src/db/health` and `src/lib/health/crypto`. They never make HTTP round-trips to the health API routes.

### Supabase storage client (module-level, private)

```typescript
import { createClient } from '@supabase/supabase-js'

// Used only for storage operations (signed URLs, no DB)
function getHealthStorageClient() {
  return createClient(
    process.env.HEALTH_SUPABASE_URL!,
    process.env.HEALTH_SUPABASE_SERVICE_KEY!
  )
}
```

### Action signatures and contracts

```typescript
export async function getHealthDashboardData(): Promise<HealthDashboardData>
```
Fetches all data for the initial dashboard render. Single round-trip optimized.
- Gets `session.user.id` via `getServerSession(authOptions)` — throws if not authenticated
- Queries `healthDb` for snapshots in the last 14 days (all types) in one query
- Decrypts each payload with `decryptPHI`
- Builds `LatestVitals` from the most recent of each relevant type
- Builds chart arrays from decrypted payloads
- Fetches snapshot count
- Generates signed read URLs for any TIFF-type snapshots (calls `getSignedReadUrls`)
- Returns `HealthDashboardData`

Implementation notes:
- If no snapshots exist: return empty arrays and null vitals — the page renders empty states
- Sort order: newest first for `recentSnapshots`; oldest first for chart arrays (charts read left-to-right = time ascending)
- For TIFF page signed URLs: only generate for the most recent 5 ICD reports (avoid generating hundreds of URLs on first load)
- Log `view` PHI audit entry for the full fetch (fire-and-forget, resourceType `'report'`)

```typescript
export async function getSnapshotPage(
  offset: number,
  limit: number = 20
): Promise<{ snapshots: SnapshotSummary[]; total: number }>
```
Paginated timeline fetch. Used when user scrolls past the initial 20.
- Requires authenticated session
- Returns `SnapshotSummary[]` with computed summaries
- Does NOT generate TIFF signed URLs for paginated rows (performance — only generate on demand)
- Logs `view` audit entry

```typescript
export async function getSignedReadUrls(
  storageKeys: string[]
): Promise<Record<string, string>>
```
Generates signed read URLs for private storage files.
- Returns `{ [storageKey]: signedUrl }` map
- Expiry: 3600 seconds (1 hour)
- Uses `HEALTH_SUPABASE_SERVICE_KEY`
- Empty keys array → returns `{}`
- Max 20 keys per call — throw if exceeded

```typescript
export async function presignHealthUpload(
  filename: string,
  contentType: string,
  fileSizeBytes: number
): Promise<PresignUploadResponse>
```
Wraps the presign logic (same as `/api/health/upload/presign` but called from server actions).
- Validates MIME type and size
- Returns signed upload URL + storage key

```typescript
export async function confirmHealthUpload(
  storageKey: string,
  type: HealthSnapshotType,
  recordedAt: string,
  source: HealthSnapshotSource,
  metadata?: Record<string, unknown>
): Promise<ConfirmUploadResponse>
```
Wraps the confirm logic.
- Validates `storageKey` starts with `health-uploads/${userId}/`
- Triggers TIFF conversion if applicable
- Creates snapshot record

### `computeSnapshotSummary` (private, not exported)

```typescript
function computeSnapshotSummary(
  type: HealthSnapshotType,
  payload: HealthPayload
): { summary: string; flagCount: number }
```

| type | summary format | flagCount |
|------|----------------|-----------|
| `garmin_daily` | `HR: {restingHR} bpm resting · {steps.toLocaleString()} steps` | 0 |
| `garmin_hrv` | `HRV: {avgHRV} ms avg` | 0 |
| `lab_result` | `{results.length} tests · {flaggedCount} flagged` | count of items with `flag !== null` |
| `icd_report` | `Battery: {batteryPct}% · {nsVtEpisodes} NSVTs · {svtEpisodes} SVTs` | 0 |
| `vital_signs` | `BP: {systolic}/{diastolic} mmHg · HR: {heartRate} bpm` (nulls shown as `—`) | 0 |
| `mychart_doc` | `MyChart document` | 0 |
| `ocr_document` | `Scanned document — {parsedFields count} fields parsed` | 0 |

---

## Step 2: ShellSidebar — Health Nav Entry

**File:** `chorum_v2/src/components/shell/ShellSidebar.tsx`

One change only. Modify `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
    { href: '/chat',      label: 'Chat' },
    { href: '/knowledge', label: 'Knowledge' },
    { href: '/inbox',     label: 'Inbox' },
    { href: '/health',    label: 'Health' },   // ADD
    { href: '/audit',     label: 'Audit' },
    { href: '/settings',  label: 'Settings' },
]
```

No other changes to this file. The active-state highlighting and mobile behavior already work for any path in `NAV_ITEMS`.

---

## Step 3: Vitals Strip

**File:** `chorum_v2/src/components/shell/health/VitalsStrip.tsx`

Server component. Receives `vitals: LatestVitals`.

### Layout

Four cards in a row, wrapping on mobile. Each card:
```
┌─────────────────────────┐
│  LABEL        (unit)    │
│  VALUE                  │
│  recorded N days ago    │
└─────────────────────────┘
```

Cards: Resting HR · Avg HRV · Steps · Sleep Score

If value is null: display `—` in place of value, no unit, no timestamp.

### Component

```typescript
export function VitalsStrip({ vitals }: { vitals: LatestVitals }) {
  // 4 cards defined as a data array, rendered with .map()
}
```

Cards definition:
```typescript
const cards = [
  { label: 'Resting HR',   value: vitals.restingHR,  unit: 'bpm',     accent: 'var(--hg-destructive)' },
  { label: 'Avg HRV',      value: vitals.avgHRV,     unit: 'ms',      accent: 'var(--hg-accent)' },
  { label: 'Steps',        value: vitals.steps,      unit: 'steps',   accent: 'var(--hg-accent-warm)' },
  { label: 'Sleep Score',  value: vitals.sleepScore, unit: '/ 100',   accent: 'var(--hg-success)' },
]
```

Value formatting:
- Steps: `value.toLocaleString()` (adds commas)
- All others: `value.toString()`

Staleness indicator: if `recordedAt` is more than 24 hours ago, show the label in `--hg-text-tertiary` instead of the accent color.

CSS: inline styles using `--hg-*` vars. No border-radius. Cards separated by `1px solid var(--hg-border)`.

---

## Step 4: Health Charts

**File:** `chorum_v2/src/components/shell/health/HealthCharts.tsx`

`'use client'`

Receives `{ hrChart, hrvChart, sleepChart, stepsChart }` as props. All are pre-fetched arrays from the server action.

**Do not** dynamic-import with `ssr: false`. This component is only rendered inside the client subtree of the health page (the page passes data down; the chart component itself is `'use client'`).

### Recharts import

```typescript
import {
  AreaChart, Area,
  ScatterChart, Scatter,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
  CartesianGrid,
} from 'recharts'
```

### Chart layout

Two charts per row, wrapping on mobile. Each chart in a labeled section:
```
┌────────────────────────────────────────────────────┐
│  LABEL (10px mono uppercase)                        │
│  [chart area 200px tall]                            │
│                                                     │
│  empty state if data.length === 0                   │
└────────────────────────────────────────────────────┘
```

### Chart 1: Heart Rate — Area Chart

```typescript
<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={hrChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(d) => d.slice(5)} />  {/* MM-DD */}
    <YAxis tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }} domain={['auto', 'auto']} />
    <Tooltip contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }} />
    <Area type="monotone" dataKey="restingHR" stroke="var(--hg-destructive)"
          fill="rgba(220,38,38,0.08)" strokeWidth={1.5} name="Resting HR" />
    <Area type="monotone" dataKey="avgHR" stroke="var(--hg-accent)"
          fill="rgba(41,171,226,0.06)" strokeWidth={1} name="Avg HR" />
  </AreaChart>
</ResponsiveContainer>
```

Empty state: `<p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No heart rate data yet</p>`

### Chart 2: HRV — Scatter + Trend Line

```typescript
<ResponsiveContainer width="100%" height={200}>
  <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
    <XAxis dataKey="date" name="Date" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(d) => d.slice(5)} />
    <YAxis dataKey="avgHRV" name="HRV (ms)" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }} />
    <Tooltip cursor={{ strokeDasharray: '3 3' }}
             contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }} />
    <Scatter data={hrvChart} fill="var(--hg-accent)" opacity={0.7} />
    {/* Trend line: average value as horizontal ReferenceLine */}
    {hrvChart.length > 0 && (
      <ReferenceLine
        y={hrvChart.reduce((s, p) => s + p.avgHRV, 0) / hrvChart.length}
        stroke="var(--hg-accent-warm)" strokeDasharray="4 4" strokeWidth={1}
        label={{ value: 'avg', fill: 'var(--hg-text-tertiary)', fontSize: 10 }}
      />
    )}
  </ScatterChart>
</ResponsiveContainer>
```

Empty state: `<p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No HRV data yet</p>`

### Chart 3: Sleep — Stacked Bar

```typescript
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={sleepChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(d) => d.slice(5)} />
    <YAxis tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(v) => `${Math.round(v/60)}h`} />
    <Tooltip contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }}
             formatter={(v: number, name: string) => [`${Math.round(v/60)}h ${v%60}m`, name]} />
    <Bar dataKey="deepMinutes"  stackId="sleep" fill="var(--hg-accent)"       name="Deep" />
    <Bar dataKey="remMinutes"   stackId="sleep" fill="var(--hg-accent-warm)"  name="REM" />
    <Bar dataKey="lightMinutes" stackId="sleep" fill="var(--hg-border-subtle)" name="Light" />
  </BarChart>
</ResponsiveContainer>
```

Empty state: `<p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No sleep data yet</p>`

### Chart 4: Steps — Bar + Goal Line

```typescript
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={stepsChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(d) => d.slice(5)} />
    <YAxis tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
           tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
    <Tooltip contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }}
             formatter={(v: number) => [v.toLocaleString(), 'Steps']} />
    <Bar dataKey="steps" fill="var(--hg-accent-warm)" opacity={0.8} />
    <ReferenceLine y={10000} stroke="var(--hg-accent)" strokeDasharray="4 4" strokeWidth={1}
                   label={{ value: '10k goal', fill: 'var(--hg-text-tertiary)', fontSize: 10 }} />
  </BarChart>
</ResponsiveContainer>
```

Empty state: `<p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No steps data yet</p>`

### Component export

```typescript
export function HealthCharts({
  hrChart,
  hrvChart,
  sleepChart,
  stepsChart,
}: {
  hrChart: HRChartPoint[]
  hrvChart: HRVChartPoint[]
  sleepChart: SleepChartPoint[]
  stepsChart: StepsChartPoint[]
})
```

Layout: 2-column CSS grid on md+, single column on mobile. Chart sections separated by `1px solid var(--hg-border)`. Each chart has a `10px mono uppercase letter-spacing` label above it.

---

## Step 5: TIFF Viewer

**File:** `chorum_v2/src/components/shell/health/TiffViewer.tsx`

`'use client'`

```typescript
export function TiffViewer({ pages }: { pages: string[] })
// pages: array of signed read URLs to PNG pages
```

### Behavior

- Renders the current page as `<img src={pages[currentPage]} />`, `width: '100%'`
- Page navigation: `← Page N/total →` between the image
- Previous/next buttons disabled at boundaries
- **Zoom modal**: clicking the image opens a full-screen modal overlay. The modal shows the image at `max-width: 90vw, max-height: 90vh`. Click outside or press Escape to close.
- If `pages.length === 0`: render `<div>No pages available</div>`

### State

```typescript
const [currentPage, setCurrentPage] = useState(0)
const [zoomed, setZoomed] = useState(false)
```

### Keyboard

`useEffect` on mount: listen for `keydown`. If `zoomed && key === 'Escape'` → `setZoomed(false)`.

### CSS

No border-radius. Navigation row uses `hg-btn` class for prev/next. Zoomed modal uses fixed overlay `rgba(0,0,0,0.85)`.

---

## Step 6: Upload Zone

**File:** `chorum_v2/src/components/shell/health/UploadZone.tsx`

`'use client'`

```typescript
export function UploadZone({ onUploaded }: { onUploaded: () => void })
// onUploaded: callback to notify parent to refresh the timeline
```

### Upload flow

```
1. User drops/selects file
2. Component guesses type from file extension (see type inference table)
3. Component shows: filename, detected type dropdown, date picker (defaults today)
4. User confirms → "Upload" button
5. Component calls presignHealthUpload() server action → gets { uploadUrl, storageKey }
6. Component PUT-fetches uploadUrl with file body (direct to Supabase Storage)
7. Component calls confirmHealthUpload() server action → gets { snapshotId }
8. Component calls onUploaded()
9. Component resets to idle state
```

**Step 6 progress states:** `idle` → `selected` → `uploading` → `confirming` → `done` | `error`

### Type inference from file extension

| Extension | Default `type` |
|-----------|---------------|
| `.tiff`, `.tif` | `icd_report` |
| `.pdf`, `.png`, `.jpg`, `.jpeg` | `mychart_doc` |
| `.csv` | `lab_result` |
| `.fit` | `garmin_daily` |

User can override via a `<select>` showing all `HealthSnapshotType` values with human-friendly labels:

| Value | Label |
|-------|-------|
| `garmin_daily` | Garmin Daily Activity |
| `garmin_hrv` | Garmin HRV |
| `lab_result` | Lab Result |
| `icd_report` | ICD Device Report |
| `vital_signs` | Vital Signs |
| `mychart_doc` | MyChart Document |
| `ocr_document` | Scanned Document |

### Accepted file types

```
accept=".tiff,.tif,.pdf,.png,.jpg,.jpeg,.csv,.fit"
```

Max size: 50 MB (matches presign route validation). If `file.size > 52_428_800`: show inline error, do not proceed to presign.

### Upload progress

Use `XMLHttpRequest` (not `fetch`) for the PUT to Supabase Storage — `fetch` does not expose upload progress. Track `xhr.upload.onprogress` to show a progress bar.

```typescript
function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void>
```

### Source assignment

All uploads from the web dashboard default to `source: 'file_upload'`.

### UI layout

```
┌─────────────────────────────────────────────────────────────┐
│  UPLOAD                                              [×]    │  header + close
├─────────────────────────────────────────────────────────────┤
│  ┌─ drop zone ──────────────────────────────────────────┐   │
│  │  Drop a file here or click to browse                 │   │
│  │  PDF · TIFF · PNG · JPG · CSV · FIT · max 50 MB      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  (when file selected:)                                      │
│  filename.pdf          [type ▾]         [date ▾]           │
│  ████████████░░░░░░░░  48%                                  │  progress bar
│                                                             │
│                              [Cancel]     [Upload]          │
└─────────────────────────────────────────────────────────────┘
```

The drop zone has `dashed` border using `var(--hg-border-subtle)`. On drag-over: border becomes `var(--hg-accent)` with `background: var(--hg-accent-muted)`. No border-radius.

### Error handling

| Error | Display |
|-------|---------|
| File too large | Inline below drop zone: "File exceeds 50 MB limit" |
| Unsupported type | Inline: "Unsupported file type" |
| Presign fails | Inline: "Upload setup failed — try again" |
| Storage PUT fails | Inline: "Upload failed — check your connection" |
| Confirm fails | Inline: "File uploaded but could not be saved — contact support" |

All errors are inline (not toasts). Errors clear when the user selects a new file.

---

## Step 7: Snapshot Timeline

**File:** `chorum_v2/src/components/shell/health/SnapshotTimeline.tsx`

Server component. Receives `{ snapshots: SnapshotSummary[], total: number }`.

### Timeline entry

Each entry:
```
┌────────────────────────────────────────────────────────────┐
│  [TYPE BADGE]  2026-03-05 · garmin                         │
│  HR: 58 bpm resting · 9,847 steps                          │
│                                                            │
│  (if icd_report with tiffPageUrls:)                        │
│  [TiffViewer pages={tiffPageUrls} ]                        │
└────────────────────────────────────────────────────────────┘
```

**Type badge colors:**

| type | background | text color |
|------|-----------|------------|
| `garmin_daily` | `var(--hg-accent-muted)` | `var(--hg-accent)` |
| `garmin_hrv` | `var(--hg-accent-muted)` | `var(--hg-accent)` |
| `lab_result` | `rgba(168,85,247,0.12)` | `#c084fc` |
| `icd_report` | `rgba(247,195,37,0.12)` | `var(--hg-accent-warm)` |
| `vital_signs` | `rgba(34,197,94,0.12)` | `var(--hg-success)` |
| `mychart_doc` | `var(--hg-surface)` | `var(--hg-text-secondary)` |
| `ocr_document` | `var(--hg-surface)` | `var(--hg-text-secondary)` |

**Flag indicator:** if `flagCount > 0`, show `{flagCount} flagged` in `var(--hg-destructive)` after the summary.

**`TiffViewer` placement:** if `snapshot.tiffPageUrls` is non-null and non-empty, render `<TiffViewer pages={snapshot.tiffPageUrls} />` below the summary. `TiffViewer` is a client component — `SnapshotTimeline` can include it (server components can render client components as children).

### Pagination

The timeline shows the initial 20 snapshots (passed as props). A "Load more" button at the bottom calls a client-side refresh. To keep this simple in Phase 2: implement "load more" as a link to `?page=2`, handled by the parent server page via searchParams.

If `snapshots.length === 0`: render:
```
<div>
  <p>No health data yet.</p>
  <p>Upload a file or connect Garmin to get started.</p>
</div>
```

---

## Step 8: Health Dashboard Page

**File:** `chorum_v2/src/app/(shell)/health/page.tsx`

Server component. Auth is already enforced by `(shell)/layout.tsx` — do not duplicate the auth check.

```typescript
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getHealthDashboardData } from '@/lib/shell/health-actions'
// ... component imports

export default async function HealthPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const session = await getServerSession(authOptions)
  const userId = session!.user.id  // guaranteed by shell layout

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * 20

  const dashboardData = await getHealthDashboardData()
  // For page > 1: fetch paginated timeline
  // getHealthDashboardData already returns first page (offset 0)

  // ...
}
```

### Page layout

```
┌─ page header ─────────────────────────────────────────────────────────────┐
│  Health              last snapshot: 2026-03-05 14:23  [Upload]            │
├─ vitals strip ────────────────────────────────────────────────────────────┤
│  [VitalsStrip vitals={dashboardData.vitals} ]                             │
├─ charts ──────────────────────────────────────────────────────────────────┤
│  [HealthCharts hrChart={...} hrvChart={...} ... ]                         │
├─ timeline header ─────────────────────────────────────────────────────────┤
│  SNAPSHOTS ({dashboardData.totalSnapshots} total)                         │
├─ timeline list ────────────────────────────────────────────────────────────│
│  [SnapshotTimeline snapshots={...} total={...} ]                          │
├─ (upload zone — shown when state = upload open) ───────────────────────── │
│  [UploadZone onUploaded={refresh} ]                                       │
└────────────────────────────────────────────────────────────────────────── ┘
```

The "Upload" button in the header triggers the `UploadZone`. Since the page is a server component but the upload zone is client-only, use a wrapper:

**File:** `chorum_v2/src/components/shell/health/HealthPageClient.tsx`

`'use client'`

```typescript
export function HealthPageClient({
  dashboardData,
}: {
  dashboardData: HealthDashboardData
}) {
  const [showUpload, setShowUpload] = useState(false)
  const router = useRouter()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--hg-border)] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-medium text-[var(--hg-text-primary)]">Health</h1>
          {dashboardData.vitals.lastSnapshotAt && (
            <p className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">
              last snapshot: {new Date(dashboardData.vitals.lastSnapshotAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chat" className="hg-btn text-xs">
            Ask Health Monitor
          </Link>
          <button onClick={() => setShowUpload(!showUpload)} className="hg-btn hg-btn-accent text-xs">
            {showUpload ? 'Cancel upload' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Upload zone (collapsible) */}
      {showUpload && (
        <div className="px-6 py-4 border-b border-[var(--hg-border)]">
          <UploadZone onUploaded={() => {
            setShowUpload(false)
            router.refresh()
          }} />
        </div>
      )}

      {/* Vitals strip */}
      <div className="px-6 py-4 border-b border-[var(--hg-border)]">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Latest
        </p>
        <VitalsStrip vitals={dashboardData.vitals} />
      </div>

      {/* Charts */}
      <div className="px-6 py-4 border-b border-[var(--hg-border)]">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Last 14 Days
        </p>
        <HealthCharts
          hrChart={dashboardData.hrChart}
          hrvChart={dashboardData.hrvChart}
          sleepChart={dashboardData.sleepChart}
          stepsChart={dashboardData.stepsChart}
        />
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Snapshots ({dashboardData.totalSnapshots} total)
        </p>
        <SnapshotTimeline
          snapshots={dashboardData.recentSnapshots}
          total={dashboardData.totalSnapshots}
        />
      </div>
    </div>
  )
}
```

The server page (`health/page.tsx`) fetches data and renders `<HealthPageClient dashboardData={data} />`.

---

## Step 9: MCP Health Tools

### 9.1 — Modify `src/app/api/mcp/route.ts`

**Add to `MCP_TOOL_MANIFEST`:**

```typescript
{
  name: 'health_snapshot',
  description: 'Store a point-in-time health data record (Garmin metrics, lab results, ICD report, vital signs).',
},
{
  name: 'health_trends',
  description: 'Query recent health data. Returns structured metrics for the last N days. Use this before answering questions about the user\'s health patterns.',
},
{
  name: 'health_sources',
  description: 'Search trusted medical knowledge sources (Mayo Clinic, NIH, Cleveland Clinic, etc.) for a health query.',
},
{
  name: 'health_checkup',
  description: 'Retrieve a structured summary of the user\'s recent health data (last 7 days). Returns numeric metrics only. Does not analyze or diagnose.',
},
```

**Add to `TOOL_SCOPES`:**

```typescript
health_snapshot: 'write:nebula',
health_trends:   'read:nebula',
health_sources:  'read:nebula',
health_checkup:  'read:nebula',
```

**Add import:**

```typescript
import {
  handleHealthSnapshot,
  handleHealthTrends,
  handleHealthSources,
  handleHealthCheckup,
} from '@/lib/customization/health-handlers'
```

**Add to the tool dispatch switch/if block** (wherever `read_nebula`, `inject_learning`, etc. are dispatched):

```typescript
case 'health_snapshot':
  result = await handleHealthSnapshot(params, auth)
  break
case 'health_trends':
  result = await handleHealthTrends(params, auth)
  break
case 'health_sources':
  result = await handleHealthSources(params, auth)
  break
case 'health_checkup':
  result = await handleHealthCheckup(params, auth)
  break
```

### 9.2 — Health handlers

**File:** `chorum_v2/src/lib/customization/health-handlers.ts`

```typescript
import type { AuthContext } from './types'
import type { MCPResponse } from './types'
import { healthDb } from '@/db/health'
import { healthSources, healthSnapshots } from '@/db/health-schema'
import { decryptPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { eq, and, gte, desc } from 'drizzle-orm'
import type {
  HealthSnapshotType,
  CreateSnapshotRequest,
} from '@chorum/health-types'
```

#### `handleHealthSnapshot`

```typescript
export async function handleHealthSnapshot(
  params: unknown,
  auth: AuthContext
): Promise<MCPResponse>
```

- Validates `params` as `CreateSnapshotRequest` shape (Zod schema)
- Calls the snapshot creation logic (hash → dedup check → encrypt → insert) using `healthDb` directly
- Logs `create` PHI audit entry
- Returns `{ id, created }` in MCP content format:
  ```json
  { "type": "text", "text": "Snapshot stored. ID: {id}. Duplicate: {!created}" }
  ```

#### `handleHealthTrends`

```typescript
export async function handleHealthTrends(
  params: unknown,
  auth: AuthContext
): Promise<MCPResponse>
```

Params schema:
```typescript
{ type: HealthSnapshotType, days: number }  // days: 1–90
```

- Fetches snapshots of `type` from the last `days` days for `auth.userId`
- Decrypts each payload
- Logs `view` PHI audit entry
- Returns structured summary in JSON text:

```typescript
// Example response text:
{
  "type": "garmin_daily",
  "period": "2026-02-20 to 2026-03-05",
  "count": 14,
  "restingHR": { "min": 52, "max": 61, "avg": 56.4 },
  "steps": { "min": 4200, "max": 12800, "avg": 8340 },
  "sleepScore": { "avg": 72 }
}
```

Returns the JSON as a `"text"` content item. The calling AI (Claude, GPT, etc.) can interpret it.

If no data: return `{ "count": 0, "message": "No {type} data in the last {days} days." }`

#### `handleHealthSources`

```typescript
export async function handleHealthSources(
  params: unknown,
  auth: AuthContext
): Promise<MCPResponse>
```

Params schema:
```typescript
{ query: string, domain?: string }
```

- Queries `healthSources` table: `WHERE active = true AND (domain = $domain OR $domain IS NULL)`
- Filters by `name ILIKE %query%` OR `domain ILIKE %query%` if `query` is present
- Returns up to 5 results
- No PHI involved — no audit log entry required
- Response format:

```typescript
// Text JSON response:
[
  { "name": "Mayo Clinic", "url": "https://www.mayoclinic.org", "domain": "general" },
  { "name": "Cleveland Clinic", "url": "https://my.clevelandclinic.org", "domain": "cardiology" }
]
```

#### `handleHealthCheckup`

```typescript
export async function handleHealthCheckup(
  params: unknown,
  auth: AuthContext
): Promise<MCPResponse>
```

**Phase 2 implementation:** Returns structured numeric summary. No LLM call. No text-based PHI processed.

- Fetches last 7 days of snapshots for `auth.userId`
- Processes ONLY types: `garmin_daily`, `garmin_hrv`, `vital_signs`, `lab_result`
- Skips: `mychart_doc`, `icd_report`, `ocr_document` (may contain PII — de-identifier not ready)
- Decrypts and aggregates
- Logs `view` PHI audit entry (`resourceType: 'report'`)

Response format:
```json
{
  "period": "2026-02-27 to 2026-03-05",
  "note": "Text-based documents excluded pending de-identification (Phase 3).",
  "garmin_daily": { "days": 6, "avgRestingHR": 57, "avgSteps": 8340 },
  "garmin_hrv": { "days": 5, "avgHRV": 48.2 },
  "vital_signs": { "readings": 2, "latestBP": "118/76" },
  "lab_result": { "panels": 1, "flaggedValues": 2 }
}
```

If a type has no data, omit its key from the response. If all types have no data:
```json
{ "message": "No health data available for the last 7 days. Upload data or connect Garmin to get started." }
```

---

## Step 10: Vitest Tests

### 10.1 — Health server action tests

**File:** `chorum_v2/src/__tests__/health/health-actions.test.ts`

```typescript
describe('getHealthDashboardData', () => {
  it('returns empty vitals and empty arrays when no snapshots exist')
  it('returns LatestVitals populated from garmin_daily snapshot')
  it('returns HRChartPoint array sorted oldest-first')
  it('sets restingHR from most recent garmin_daily snapshot')
  it('writes a view phi_audit_log entry')
})

describe('computeSnapshotSummary (internal)', () => {
  it('formats garmin_daily summary with steps formatted with commas')
  it('formats lab_result summary with flagCount matching items with non-null flag')
  it('formats icd_report summary with battery percentage')
  it('returns flagCount of 0 for non-lab types')
})

describe('presignHealthUpload', () => {
  it('rejects files over 50 MB')
  it('rejects unsupported MIME type')
  it('returns uploadUrl and storageKey for valid input')
})

describe('confirmHealthUpload', () => {
  it('rejects storageKey that does not start with health-uploads/{userId}/')
  it('creates snapshot record for non-TIFF file')
  it('returns tiffPages array after TIFF conversion')
})

describe('getSignedReadUrls', () => {
  it('returns empty object for empty input array')
  it('throws when more than 20 keys are provided')
  it('returns signed URL map for valid keys')
})
```

### 10.2 — MCP handler tests

**File:** `chorum_v2/src/__tests__/health/health-handlers.test.ts`

```typescript
describe('handleHealthTrends', () => {
  it('returns count: 0 message when no data exists for type')
  it('returns correct avg restingHR across multiple garmin_daily snapshots')
  it('rejects days param > 90')
  it('writes a view phi_audit_log entry')
})

describe('handleHealthSources', () => {
  it('returns up to 5 sources')
  it('filters by domain when domain param is provided')
  it('returns empty array when query matches nothing')
  it('does not write a phi_audit_log entry (no PHI involved)')
})

describe('handleHealthCheckup', () => {
  it('excludes mychart_doc and ocr_document from processing')
  it('returns period covering last 7 days')
  it('returns message when no data exists')
  it('includes note about excluded document types in response')
  it('writes a view phi_audit_log entry with resourceType report')
})

describe('handleHealthSnapshot', () => {
  it('returns 400-equivalent error for invalid params')
  it('stores snapshot and returns { created: true } for valid garmin_daily payload')
  it('returns { created: false } on duplicate')
})
```

---

## Invariants

1. **Server actions own all PHI decryption.** No health payload is decrypted in a client component. Charts and timelines receive pre-shaped `number[]` or `string` values. The `HealthDashboardData` type contains no `encryptedPayload` or `payloadIv` fields.

2. **`HealthPageClient` is the only client component that knows the page layout.** `VitalsStrip` and `SnapshotTimeline` are server components passed pre-fetched data. `HealthCharts`, `UploadZone`, `TiffViewer` are client components that receive typed props only.

3. **`UploadZone` uses XHR for the storage PUT.** `fetch` does not expose upload progress. The progress bar requires `XMLHttpRequest`.

4. **TiffViewer signed URLs have 1-hour expiry.** Generated in `getHealthDashboardData` at page render time. On subsequent navigations within the hour, the URLs remain valid. The page server-renders fresh URLs on each full page load.

5. **`health_checkup` processes numeric snapshot types only in Phase 2.** `mychart_doc`, `icd_report`, `ocr_document` are explicitly skipped. The response includes a `note` field stating this. Phase 3 removes this restriction after implementing `deidentify.ts`.

6. **No Garmin-specific UI.** Charts render empty states until Garmin data exists. This is expected in Phase 2 — no empty state is treated as an error.

7. **Health server actions call `healthDb` directly.** They do not make HTTP requests to `src/app/api/health/*`. Those routes exist for the mobile client. Server actions take the direct path.

8. **No `any` types.** All action return types are typed. All component props are typed. All Zod schemas have corresponding TypeScript types from `@chorum/health-types`.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `getHealthDashboardData` — `healthDb` unreachable | Catch and return empty `HealthDashboardData`; page renders with all empty states |
| `getHealthDashboardData` — decryption fails on a row | Skip that row (same as snapshot GET behavior in Phase 1) |
| `getSignedReadUrls` — storage client fails | Return `{}` — TIFF viewer renders "no pages available" |
| `UploadZone` — presign fails | Inline error: "Upload setup failed — try again" |
| `UploadZone` — storage PUT returns non-200 | Inline error: "Upload failed — check your connection" |
| `UploadZone` — confirm fails | Inline error: "File uploaded but could not be saved — contact support" |
| MCP handler — `healthDb` unreachable | Return MCP error response with `code: -32603` and message "Health data unavailable" |
| MCP `handleHealthTrends` — invalid `days` (>90) | Return MCP error with `code: -32602` and message "days must be between 1 and 90" |
| `handleHealthSources` — no results | Return empty array (not an error) |
| Nav link to `/health` — no data | Timeline shows empty state; vitals show `—`; charts show empty states |

---

## Completion Criteria

Health Phase 2 is complete when **all** of the following are true:

- [ ] `GarminDailyPayload` has `sleepScore` and `sleepDurationMinutes` fields in `@chorum/health-types`
- [ ] `HealthDashboardData`, `LatestVitals`, `SnapshotSummary` types exported from `@chorum/health-types`
- [ ] `Health` appears in ShellSidebar nav, active-state highlight works on `/health`
- [ ] `getHealthDashboardData` server action returns typed `HealthDashboardData`
- [ ] Health page renders at `/health` — no TypeScript errors, no runtime errors
- [ ] Vitals strip shows `—` for all values when no snapshots exist
- [ ] Vitals strip shows correct values when garmin_daily snapshots exist
- [ ] All 4 Recharts charts render empty states when their respective data arrays are empty
- [ ] Uploading a PNG via UploadZone creates a snapshot and refreshes the timeline
- [ ] Uploading a TIFF via UploadZone triggers PNG conversion and shows TiffViewer in timeline
- [ ] TiffViewer page navigation works; zoom modal opens on click and closes on Escape
- [ ] `POST /api/mcp` with `health_sources` tool returns list of trusted sources
- [ ] `POST /api/mcp` with `health_trends` tool returns `count: 0` message when no data
- [ ] `POST /api/mcp` with `health_checkup` returns structured JSON including `note` about excluded types
- [ ] `POST /api/mcp` with `health_snapshot` creates a snapshot; duplicate returns `created: false`
- [ ] All 4 MCP tools return 401 via the standard auth flow when unauthenticated
- [ ] All health server action tests pass
- [ ] All MCP handler tests pass
- [ ] `npx next build` passes with zero type errors
- [ ] `npx vitest run` passes all health tests (Phase 1 + Phase 2)

---

## What to Defer (Do Not Implement in Phase 2)

| Item | Phase |
|------|-------|
| Garmin credential setup UI | 3 |
| `garmin_sync_state` table and cron | 3 |
| Moving averages + anomaly detection | 3 |
| `deidentify.ts` + full `health_checkup` LLM analysis | 3 |
| Lab value reference range `ReferenceArea` in charts (needs actual data to validate) | 3 |
| Mobile app scaffold | 4 |
| `mobile-init` auth route | 4 |
| Push notification delivery | 5 |
| 15-minute idle auto-logoff on `/health` | 6 |
| Rate limiting on health server actions | 6 |
