# Phase 3 Review

**Date:** 2026-03-06
**Reviewer:** Claude (claude-sonnet-4-6)
**Scope:** Health Phase 3 (`HEALTH_PHASE_3_SPEC.md`) — pass/fail against spec
**Verdict:** CONDITIONAL PASS — 1 build blocker, 1 temporal regression, 1 design note

---

## Deliverable Checklist

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 1 | `src/lib/health/garmin-transformer.ts` | PASS | Both transformers present; defensive field access; null-on-malformed |
| 2 | `src/lib/health/deidentify.ts` | PASS | All 18 HIPAA Safe Harbor categories covered; `deidentify` + `deidentifyObject` present |
| 3 | `src/app/api/health/garmin/connect/route.ts` | PASS | POST + DELETE; live credential validation; `usernameIv:passwordIv` IV format |
| 4 | `src/app/api/health/garmin/sync/route.ts` | PASS | Delegates to `syncGarminForUser`; auth pattern correct (`if (!auth)`) |
| 5 | `src/app/api/health/trends/route.ts` | PASS | `trend-math.ts` exists; moving averages, anomaly detection, baseline; `TrendResult` returned |
| 6 | `src/app/api/cron/health-garmin-sync/route.ts` | PASS | Cron secret check; `Promise.allSettled`; iterates all users in `garminSyncState` |
| 7 | `src/app/api/cron/health-checkup/route.ts` | CONDITIONAL | See Issue 2 — temporal awareness regressed |
| 8 | `health-handlers.ts` — `health_checkup` updated | PASS | Phase 3 MCP shape; returns `deidentifiedData` + `instruction`; audit logged |
| 9 | `vercel.json` cron entries | PASS | Already present; correctly not modified |
| 10 | `src/__tests__/health/garmin-transformer.test.ts` | PASS | Present; 98 tests passed per changelog |
| 11 | `src/__tests__/health/deidentify.test.ts` | PASS | Present; passes |
| 12 | `src/__tests__/health/trends.test.ts` | PASS | Present; passes |

---

## Issues

### Issue 1 — Build Blocker: `searchParams` type in `health/page.tsx`

**Severity:** Build blocker (carried from Phase 2, not introduced by Phase 3)

**Root cause:** Next.js 15 generates `PageProps` where `searchParams` must be `Promise<...>`, not a union type. The current typing is:

```typescript
// Current — fails Next.js 15 PageProps constraint
searchParams?: SearchParams | Promise<SearchParams>
```

**Fix required in `src/app/(shell)/health/page.tsx`:**

```typescript
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: rawPage = '1' } = await searchParams
  const page = Math.max(1, Number.parseInt(rawPage, 10) || 1)
  const offset = (page - 1) * 20
  // ... rest unchanged
```

Remove the `Promise.resolve` workaround — Next.js 15 passes `searchParams` as a genuine `Promise`.

**This is a Phase 2 artifact that Phase 3 did not introduce but also did not fix.**

---

### Issue 2 — Temporal Regression: `health-checkup/route.ts`

**Severity:** Functional degradation (LLM still runs, but temporal context is lost)

**Background:** During the temporal awareness implementation (between Phase 1 and Phase 2), the checkup cron was updated to:
- Fetch `garminSyncState.lastSyncAt` per user in parallel with snapshot fetch
- Apply relative age labels per snapshot line (`[today]`, `[3 days ago]`, etc.)
- Build a `[HEALTH TEMPORAL CONTEXT]` block via `buildHealthTemporalBlock(deriveTemporalContext(...))`
- Prepend the temporal block to the LLM prompt

The Phase 3 rewrite overwrote this with:
- `deidentifiedPayloads: unknown[]` — raw structured objects, no age labels
- No temporal block
- Flat JSON array passed to LLM with no temporal framing

**What was lost:** The LLM now has no sense of when the data is from. A snapshot from 6 days ago looks identical to one from today. The temporal spec's entire purpose for this cron was to give the model a relative timeline anchor.

**Fix required in `src/app/api/cron/health-checkup/route.ts`:**

Add back the three imports:
```typescript
import { garminSyncState } from '@/db/health-schema'
import { buildHealthTemporalBlock, deriveTemporalContext } from '@/lib/health/temporal'
```

Add `const now = new Date()` before the user loop.

In the user loop, fetch `garminSyncState` in parallel with snapshots:
```typescript
const [rows, garminRows] = await Promise.all([
  healthDb.select()...from(healthSnapshots)...,
  healthDb.select({ lastSyncAt: garminSyncState.lastSyncAt })
    .from(garminSyncState)
    .where(eq(garminSyncState.userId, userId))
    .limit(1),
])
```

Replace the payload array with annotated lines:
```typescript
const deidentifiedLines: string[] = []
for (const row of rows) {
  try {
    const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
    const clean = deidentifyObject({ type: row.type, source: row.source, data: raw })
    const ageMs = now.getTime() - row.recordedAt.getTime()
    const ageDays = Math.floor(ageMs / 86_400_000)
    const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`
    deidentifiedLines.push(`[${ageLabel}] ${row.type}: ${JSON.stringify(clean)}`)
  } catch { /* skip */ }
}
```

Build and prepend the temporal block:
```typescript
const lastGarminSync = garminRows[0]?.lastSyncAt ?? null
const temporalCtx = deriveTemporalContext(
  rows.map(r => ({ recordedAt: r.recordedAt, type: r.type })),
  lastGarminSync,
  now,
)
const temporalBlock = buildHealthTemporalBlock(temporalCtx)

const dataBlock = deidentifiedLines.join('\n')
const prompt = `${temporalBlock}\n\nAnalyze the following de-identified health data from the past ${CHECKUP_WINDOW_DAYS} days. Identify trends, flag anomalies vs reference ranges, and summarize findings concisely.\n\n${dataBlock}`
```

---

### Issue 3 — Design Note: `health_alert` learning type

**Severity:** Non-breaking; Conductor silently ignores it

**Detail:** The Phase 3 checkup cron inserts into the `learnings` table with `type: 'health_alert'` when anomalies are detected. The `learnings.type` column is `text` with no check constraint — the insert will succeed at the DB level.

However, `health_alert` is not in `VALID_LEARNING_TYPES` in `customization/types.ts`. The Conductor's relevance engine, tier compiler, and cache system do not recognize this type. The learning will be stored but never injected into any conversation context — it is effectively a write-only record.

**Options:**
- Add `health_alert` to `VALID_LEARNING_TYPES` (makes it Conductor-injectable — potentially noisy)
- Keep as-is and treat checkup anomalies as audit trail only (current behavior)
- Store in a dedicated health alerts table in Phase 4/5

No action required for Phase 3. Document for Phase 5 design.

---

## Accepted Deviations

### `garmin-connect@^1.6.2` instead of `^1.8.1`

The spec specified `^1.8.1` but version 1.8.1 does not exist on the npm registry. Downgrade to `^1.6.2` (latest available) is the correct decision. The garmin-connect package is untyped in both versions — behavior is equivalent.

---

## Required Fixes Before Phase 4

1. **Fix `searchParams` type in `health/page.tsx`** — build will fail without this
2. **Restore temporal awareness in `health-checkup/route.ts`** — functional regression from spec intent; will cause the LLM to produce worse analysis without temporal framing

Both fixes are mechanical (no new logic, just restoring what was in place).
