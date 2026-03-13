# Temporal Awareness Spec: Conductor + Health

**Version:** 1.0
**Date:** 2026-03-06
**Status:** Ready for execution
**Applies to:** `chorum-ai` (Conductor layer) + `chorum_v2` (Health App)
**Prerequisite:** Health Phase 1 complete (health DB, crypto, snapshot API).
**Prerequisite:** Health Phase 3 complete (de-identification, health-handlers, crons).

---

## The Problem

LLMs are ephemeral. They have no experience of time passing between conversations. A learning item
established 8 months ago looks identical to one created yesterday. A health metric from 3 days ago
is visually indistinguishable from one from this morning. The model can't tell if a conversation
gap was 20 minutes or 3 weeks.

This matters in two places:

1. **The Conductor** — injected knowledge has no age signal visible to the model. A stale goal or
   outdated decision gets injected with the same authority as a fresh one.

2. **The Health App** — clinical data is acutely time-sensitive. The difference between a blood
   pressure reading from 90 minutes ago vs. 3 days ago is clinically significant and must be
   explicit in every LLM call.

---

## Agent Instructions

You are implementing **Temporal Awareness** across the Conductor and Health App. Your job is to
ensure the LLM always knows: (1) what time it is, (2) how long since it last engaged with this
project, and (3) how old every piece of injected knowledge is. You will also give each health
metric its own temporal scope so the model reasons about data freshness, not just data values.

Read this document completely before writing a single file. Every decision is locked. If something
is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. `chorum-ai`: DB migration — `last_conversation_at` on `projects`, `decays_after_days` on `project_learning_paths`
2. `chorum-ai/src/lib/learning/temporal.ts` — `buildTemporalAnchor()` and `formatItemAge()`
3. `chorum-ai/src/lib/learning/injector.ts` — inject temporal anchor; update `lastConversationAt` fire-and-forget
4. `chorum-ai/src/lib/chorum/relevance.ts` — item age labels in `assembleContext()`
5. `chorum-ai/src/lib/learning/types.ts` — add `decaysAfterDays` to `LearningItem`
6. `chorum-ai/src/lib/db/schema.ts` — add `lastConversationAt`, `decaysAfterDays` columns
7. `chorum_v2/src/lib/health/temporal.ts` — `buildHealthTemporalContext()` for health LLM calls
8. `chorum_v2/src/app/api/cron/health-checkup/route.ts` — use temporal framing
9. `chorum_v2/src/app/api/health/chat/route.ts` — use temporal framing

**What you will NOT produce:**
- Any changes to `src/lib/health/crypto.ts` or `audit.ts`
- Any changes to the health DB schema (health Supabase project)
- Any UI changes
- Any changes to the cache compiler (`cache.ts`, `compiler.ts`) — cached contexts are already
  pre-compiled; temporal anchors are injected at request time, not baked into the cache
- Any `any` types — use `unknown` + type guards

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Full health architecture |
| Phase 3 Spec | `Health App/HEALTH_PHASE_3_SPEC.md` | De-identification, checkup cron |
| Injector | `chorum-ai/src/lib/learning/injector.ts` | `injectLearningContext()` |
| Relevance | `chorum-ai/src/lib/chorum/relevance.ts` | `assembleContext()` |
| Types | `chorum-ai/src/lib/learning/types.ts` | `LearningItem` |
| Schema | `chorum-ai/src/lib/db/schema.ts` | `projects`, `projectLearningPaths` |

---

## Architecture: The Three Layers

```
EVERY LLM CALL
│
├── Layer 1: Session Temporal Anchor (injector.ts)
│   "Now: Friday March 6 2026 | Last conversation: 3 days ago"
│   → Injected once at the TOP of the assembled context block
│   → Model always knows current date/time and elapsed gap
│
├── Layer 2: Item Age Labels (relevance.ts assembleContext)
│   "[established 8 months ago] Use React Query for data fetching"
│   → Each dynamic item annotated with human-readable age
│   → Stale items get an additional [STALE — verify still applies] warning
│   → Stable types (invariant, anchor) get no age label
│
└── Layer 3: Health Temporal Framing (health/temporal.ts) [Health App only]
    "Last Garmin sync: 6 hours ago | Data window: Mar 1–6"
    → Each health metric wrapped with relative timestamp
    → Compatible with HIPAA de-identification (relative offsets, not absolute dates)
```

**Key constraint:** The temporal anchor is injected at request time, not cached. The
`learningContextCache` stores pre-compiled knowledge but NOT temporal data. The injector
prepends the anchor to whatever context string is returned (cached or live).

---

## Step 1: Schema Changes (chorum-ai)

### 1.1 — Drizzle Schema (`chorum-ai/src/lib/db/schema.ts`)

**On `projects` table** — add after `createdAt`:
```ts
lastConversationAt: timestamp('last_conversation_at'),
```

**On `projectLearningPaths` table** — add after `mutedAt`:
```ts
decaysAfterDays: integer('decays_after_days'),
// null = never stale (for invariants, anchors)
// 30 = stale after 30 days without reinforcement (for health goals, active decisions)
// 90 = stale after 90 days (for patterns, golden paths)
```

### 1.2 — SQL Migration

File: `chorum-ai/drizzle/0019_temporal_awareness.sql`

```sql
-- Add last conversation tracking to projects
ALTER TABLE projects ADD COLUMN last_conversation_at timestamptz;

-- Add staleness decay config to learning items
ALTER TABLE project_learning_paths ADD COLUMN decays_after_days integer;

-- Index: frequently queried when building temporal anchor
CREATE INDEX idx_projects_last_conversation ON projects(last_conversation_at)
  WHERE last_conversation_at IS NOT NULL;
```

> NOTE: Check `chorum-ai/drizzle/` for the next available migration number. The gitStatus shows
> `0019_certain_punisher.sql` already exists — use `0020_temporal_awareness.sql` if 0019 is taken.

### 1.3 — Default `decaysAfterDays` by Type

Do NOT set DB defaults — the default varies by type and is enforced in application logic.
In `temporal.ts`, export a constant map used by both the Conductor and health handlers:

```ts
export const DECAY_DEFAULTS_BY_TYPE: Partial<Record<LearningType, number>> = {
  pattern: 90,
  decision: 180,
  golden_path: 90,
  plot_thread: 60,
  // Stable types — no decay: invariant, anchor, antipattern, character, setting, voice, world_rule
}
```

These are fallback defaults. A per-item `decaysAfterDays` value in the DB overrides the type
default. `null` or missing from the map = never stale.

---

## Step 2: `temporal.ts` — Core Temporal Utilities (chorum-ai)

File: `chorum-ai/src/lib/learning/temporal.ts`

### 2.1 — `formatRelativeTime(date: Date, now: Date): string`

Returns a human-readable elapsed time. Used for both the session anchor and item age labels.

Rules:
- < 1 hour: `"X minutes ago"`
- < 24 hours: `"X hours ago"`
- 1 day: `"yesterday"`
- 2–6 days: `"X days ago"`
- 1–3 weeks: `"X weeks ago"`
- 1–11 months: `"X months ago"`
- >= 12 months: `"X years ago"`

Never return "0 minutes ago" — floor at `"just now"`.

### 2.2 — `isStale(item: LearningItem, now: Date): boolean`

```ts
export function isStale(item: LearningItem, now: Date): boolean
```

An item is stale when ALL of the following are true:
1. It has a `decaysAfterDays` value (either from `item.decaysAfterDays` or `DECAY_DEFAULTS_BY_TYPE[item.type]`)
2. `now - item.createdAt > decaysAfterDays * 24 * 60 * 60 * 1000`
3. `item.lastUsedAt` is null OR `now - item.lastUsedAt > decaysAfterDays * 24 * 60 * 60 * 1000`

Condition 3 is critical: an item that was used recently is not stale even if it was created long
ago. Usage resets the staleness clock.

Pinned items (`item.pinnedAt !== null`) are NEVER stale regardless of age.

### 2.3 — `formatItemAge(item: LearningItem, now: Date): string`

Returns the prefix string to prepend to an item's content in the assembled context.

```ts
export function formatItemAge(item: LearningItem, now: Date): string
```

Logic:
1. If item type is `'invariant'` or `'anchor'` → return `''` (no age label — these are permanent rules)
2. If `item.createdAt` is null → return `''`
3. Compute `established = formatRelativeTime(item.createdAt, now)`
4. If `isStale(item, now)` → return `[established ${established} — verify still applies] `
5. Otherwise → return `[established ${established}] `

Example outputs:
- `[established 3 days ago] `
- `[established 8 months ago — verify still applies] `
- `''` (for invariants and anchors)

### 2.4 — `buildTemporalAnchor(projectId: string, db: DrizzleDB, now?: Date): Promise<string>`

```ts
export async function buildTemporalAnchor(
  projectId: string,
  db: DrizzleDB,
  now?: Date
): Promise<string>
```

Queries `projects.lastConversationAt` for the given project. Returns a formatted string block.

Implementation:
```ts
const project = await db.select({ lastConversationAt: projects.lastConversationAt })
  .from(projects)
  .where(eq(projects.id, projectId))
  .limit(1)

const currentTime = now ?? new Date()
const lastConvo = project[0]?.lastConversationAt ?? null
```

Output format (injected as-is into the context block):
```
[TEMPORAL CONTEXT]
Now: {day of week}, {Month D, YYYY} — {H:MM AM/PM} UTC
Last conversation: {relative time} ({Month D, YYYY}) | Never (if null)
```

Example:
```
[TEMPORAL CONTEXT]
Now: Friday, March 6, 2026 — 2:34 PM UTC
Last conversation: 3 days ago (March 3, 2026)
```

If `lastConversationAt` is null:
```
[TEMPORAL CONTEXT]
Now: Friday, March 6, 2026 — 2:34 PM UTC
Last conversation: Never (first session)
```

Use `toLocaleString` with explicit options against UTC — do NOT use any date library. Keep the
dependency count at zero. Use only built-in `Date` and `Intl.DateTimeFormat`.

### 2.5 — `touchLastConversation(projectId: string, db: DrizzleDB): Promise<void>`

Fire-and-forget — updates `projects.lastConversationAt = NOW()`. Called by the injector after
reading the previous value.

```ts
export async function touchLastConversation(projectId: string, db: DrizzleDB): Promise<void> {
  await db.update(projects)
    .set({ lastConversationAt: new Date() })
    .where(eq(projects.id, projectId))
    .execute()
}
```

---

## Step 3: Injector Changes (`injector.ts`)

Modify `chorum-ai/src/lib/learning/injector.ts`.

### 3.1 — Add temporal anchor to the cached path

The Tier 1/2 cached fast path currently returns:
```ts
const systemPrompt = basePrompt + '\n\n---\n# Project Context\n' + cached
```

After this change:
```ts
const [temporalAnchor] = await Promise.all([
  buildTemporalAnchor(projectId, db),
  touchLastConversation(projectId, db).catch(() => {}) // fire-and-forget, never throws
])

const systemPrompt = basePrompt
  + '\n\n---\n# Project Context\n'
  + temporalAnchor + '\n\n'
  + cached
```

The `touchLastConversation` is always awaited within the `Promise.all` to avoid blocking on a
separate round-trip, but errors are swallowed — it must never fail a chat request.

### 3.2 — Add temporal anchor to the Tier 3 / live path

At the point where `systemPrompt` is assembled in the live path:
```ts
// Before:
const systemPrompt = mixedContext
  ? basePrompt + '\n\n---\n# Project Learning Context\n' + mixedContext
  : basePrompt

// After:
const temporalAnchor = await buildTemporalAnchor(projectId, db)
// touchLastConversation already called above via fire-and-forget
const systemPrompt = mixedContext
  ? basePrompt + '\n\n---\n# Project Learning Context\n' + temporalAnchor + '\n\n' + mixedContext
  : basePrompt + '\n\n---\n# Project Learning Context\n' + temporalAnchor
```

For the Tier 3 path, call `touchLastConversation` as fire-and-forget BEFORE the expensive
`Promise.all` at Step 2 in the injector, so it runs in parallel with embedding + DB queries:
```ts
touchLastConversation(projectId, db).catch(err =>
  console.error('[Temporal] lastConversation update failed:', err)
)
```

### 3.3 — Pass `now` through for testability

Add `now?: Date` as an optional last parameter to `injectLearningContext()`. Pass it through to
`buildTemporalAnchor()` and to `assembleContext()`. Tests can then freeze time.

---

## Step 4: Relevance Engine Changes (`relevance.ts`)

Modify `assembleContext()` in `chorum-ai/src/lib/chorum/relevance.ts`.

### 4.1 — Accept `now` parameter

```ts
public assembleContext(items: MemoryCandidate[], now?: Date): string
```

Pass `now` from the injector. Default to `new Date()` inside `assembleContext` if not provided.

### 4.2 — Apply age labels in each section

`MemoryCandidate` already has `createdAt`, `lastUsedAt`, `pinnedAt` fields. Import
`formatItemAge` and `isStale` from `temporal.ts`.

For each item in each section, prefix the content:

```ts
// Before:
groups['pattern'].forEach(i => sections.push(`- ${i.content}`))

// After:
groups['pattern'].forEach(i => {
  const ageLabel = formatItemAge(i, now)
  sections.push(`- ${ageLabel}${i.content}`)
})
```

Apply to: `pattern`, `decision`, `golden_path`, `plot_thread`, `antipattern`, `voice`,
`character`, `setting`, `world_rule`.

Do NOT apply to: `invariant`, `anchor` — `formatItemAge` already returns `''` for these, but
skip the call entirely for clarity.

### 4.3 — `MemoryCandidate` needs `decaysAfterDays`

Add to the `MemoryCandidate` type in `relevance.ts`:
```ts
decaysAfterDays?: number | null
```

Map it in `injector.ts` when building candidates:
```ts
decaysAfterDays: item.decaysAfterDays ?? null
```

---

## Step 5: `LearningItem` Type Changes (`types.ts`)

Add to `LearningItem` in `chorum-ai/src/lib/learning/types.ts`:

```ts
decaysAfterDays?: number | null  // null = never stale; overrides type default from DECAY_DEFAULTS_BY_TYPE
```

---

## Step 6: Health Temporal Module (`chorum_v2`)

File: `chorum_v2/src/lib/health/temporal.ts`

This module is health-specific and handles the third layer — temporal framing of health data
before it's passed to any LLM call (checkup cron, health chat, export summary).

### 6.1 — `HealthTemporalContext` type

```ts
export interface HealthTemporalContext {
  now: Date
  lastGarminSync: Date | null       // from garmin_sync_state.last_sync_at
  lastConversation: Date | null     // from projects.lastConversationAt (health project)
  dataWindowStart: Date             // oldest snapshot in the current batch
  dataWindowEnd: Date               // newest snapshot in the current batch
  snapshotCounts: Record<string, number>  // type -> count in window
}
```

### 6.2 — `buildHealthTemporalBlock(ctx: HealthTemporalContext): string`

Returns the temporal header injected at the top of every health LLM system prompt.

Output format:
```
[HEALTH TEMPORAL CONTEXT]
Now:                Friday, March 6, 2026 — 2:34 PM UTC
Last Garmin sync:   6 hours ago (synced steps, HR, HRV, sleep)
Last conversation:  3 days ago (March 3, 2026)
Data window:        March 1–6, 2026 (last 6 days)
Snapshots in view:  garmin_daily x6, garmin_hrv x6, labs x1
```

Rules:
- If `lastGarminSync` is null → `"Last Garmin sync: No sync on record"`
- If `lastConversation` is null → `"Last conversation: First health session"`
- `snapshotCounts` is displayed as `type x count` joined by `, `
- Use `formatRelativeTime()` from the shared temporal utilities. Since health-types is a
  separate package, copy `formatRelativeTime` logic locally rather than importing from
  `chorum-ai`. It is a pure function with no dependencies — duplication is correct here.
- Dates use UTC throughout. No timezone localization at this layer — health data timestamps
  are stored as UTC and remain UTC in LLM context.

### 6.3 — `wrapMetricWithAge(label: string, value: string, recordedAt: Date, now: Date): string`

Wraps a single health metric with its temporal context for inline use in data summaries.

```ts
export function wrapMetricWithAge(
  label: string,
  value: string,
  recordedAt: Date,
  now: Date
): string
```

Output: `${label} (${relativeTime}): ${value}`

Example: `Resting HR (6 hours ago): 62 bpm`
Example: `Blood pressure (3 days ago): 128/82 mmHg`

This is HIPAA-compatible: relative offsets like "3 days ago" do not constitute a date identifier
under Safe Harbor. The de-identifier in `deidentify.ts` strips absolute dates; this function
produces only relative offsets.

### 6.4 — `buildSnapshotTimeline(snapshots: DecryptedSnapshot[], now: Date): string`

Takes an array of decrypted snapshots (already de-identified) and renders a temporally-framed
summary string for the LLM.

```ts
interface DecryptedSnapshot {
  type: string
  recordedAt: Date
  payload: Record<string, unknown>  // already de-identified
}

export function buildSnapshotTimeline(
  snapshots: DecryptedSnapshot[],
  now: Date
): string
```

Output format (one section per snapshot type, chronological):
```
## Garmin Daily (last 7 days)
- 6 hours ago: steps 9,241 | resting HR 62 bpm | active calories 487 kcal
- 1 day ago: steps 7,820 | resting HR 65 bpm | active calories 412 kcal
- 2 days ago: steps 11,043 | resting HR 61 bpm | active calories 591 kcal

## Garmin HRV (last 7 days)
- 6 hours ago: HRV 54 ms | sleep score 78 | deep sleep 1h 22m
- 1 day ago: HRV 48 ms | sleep score 71 | deep sleep 1h 08m

## Lab Results
- 3 weeks ago: K+ 4.1 mEq/L (ref 3.5–5.0) | Na+ 141 mEq/L (ref 136–145)
```

Implementation rules:
- Group by `type`, then sort chronological (oldest to newest within group is fine; newest-first
  is also acceptable — pick one and be consistent: **newest-first**).
- Each line uses `wrapMetricWithAge` logic (relative time + value).
- Payload fields are rendered as key: value pairs. Unknown fields are rendered as-is.
- Max 7 items per group to avoid context bloat. If more, render the 7 most recent and append
  `(+ N older records omitted)`.
- This function does NOT decrypt — it receives already-decrypted, already-de-identified payloads.
  The caller is responsible for decryption and de-identification before calling this.

---

## Step 7: Checkup Cron Changes (`health-checkup/route.ts`)

Modify `chorum_v2/src/app/api/cron/health-checkup/route.ts`.

The checkup cron calls the Health Monitor persona. Before constructing the LLM message, it now:

1. Fetches `garmin_sync_state.last_sync_at` for the user
2. Reads `lastConversationAt` from the health project (if tracked; otherwise null)
3. Determines `dataWindowStart`/`dataWindowEnd` from the snapshots it has fetched
4. Counts snapshots by type
5. Calls `buildHealthTemporalContext()` to get the temporal header
6. Calls `buildSnapshotTimeline()` on the decrypted+de-identified snapshots
7. Constructs the LLM system prompt as:

```
{Health Monitor system prompt}

{temporal block from buildHealthTemporalBlock()}

{timeline from buildSnapshotTimeline()}
```

The user message to the LLM is:
```
Analyze the health data above. Identify any anomalies, trends, or items requiring attention.
Flag anything outside normal reference ranges. Note any data gaps (missing days, no sync).
```

**Important:** The cron already de-identifies data before sending to the LLM (Phase 3 spec).
`buildSnapshotTimeline()` receives the ALREADY de-identified snapshots. The temporal framing
(relative times) is not PHI and does not need de-identification.

---

## Step 8: Health Chat Changes (`health/chat/route.ts`)

Modify `chorum_v2/src/app/api/health/chat/route.ts`.

Currently (stub from Phase 5): returns `{ content: string }` non-streaming JSON.

Before calling the LLM:
1. Fetch recent snapshots for the user (last 30 days, all types)
2. Decrypt and de-identify
3. Build temporal context (same pattern as checkup cron)
4. Inject temporal block + snapshot timeline into system prompt

The health chat system prompt structure:
```
{Health Monitor persona prompt}

{buildHealthTemporalBlock(ctx)}

{buildSnapshotTimeline(snapshots, now)}

[DATA NOTE: All health values above are from your connected devices and uploaded records.
Absolute dates have been replaced with relative offsets for privacy.]
```

If the user has no health data yet:
```
{Health Monitor persona prompt}

{buildHealthTemporalBlock(ctx)}

[No health data on file yet. You can upload lab results, connect Garmin, or log vitals manually.]
```

---

## Validation Checklist

### Conductor (chorum-ai)

- [ ] `buildTemporalAnchor()` returns correct "Never" string for projects with null `lastConversationAt`
- [ ] `buildTemporalAnchor()` returns correct relative time for projects with known `lastConversationAt`
- [ ] `touchLastConversation()` updates `projects.lastConversationAt` in DB
- [ ] `touchLastConversation()` failure does NOT propagate — chat request completes normally
- [ ] Temporal anchor appears in system prompt for both Tier 1/2 cached path and Tier 3 live path
- [ ] `formatItemAge()` returns `''` for `invariant` and `anchor` types
- [ ] `formatItemAge()` returns `[established X ago]` for patterns, decisions, golden_path
- [ ] `formatItemAge()` returns `[established X ago — verify still applies]` for stale items
- [ ] Stale detection: item created 100 days ago, `decaysAfterDays = 90`, `lastUsedAt` = null → stale
- [ ] Stale detection: item created 100 days ago, `decaysAfterDays = 90`, `lastUsedAt` = yesterday → NOT stale
- [ ] Pinned item with 200-day age → NOT stale
- [ ] `now` parameter propagates correctly — frozen time in tests produces deterministic output
- [ ] DB migration applies cleanly; existing rows have `null` for both new columns

### Health App (chorum_v2)

- [ ] `buildHealthTemporalBlock()` renders correctly when all fields are present
- [ ] `buildHealthTemporalBlock()` renders "No sync on record" when `lastGarminSync` is null
- [ ] `wrapMetricWithAge()` output uses relative time, never absolute dates
- [ ] `buildSnapshotTimeline()` groups by type, newest-first, max 7 per group
- [ ] `buildSnapshotTimeline()` appends "(+ N older records omitted)" when truncated
- [ ] Checkup cron system prompt contains `[HEALTH TEMPORAL CONTEXT]` block before data
- [ ] Health chat system prompt contains `[HEALTH TEMPORAL CONTEXT]` block before data
- [ ] Health chat with no data returns the "No health data on file" message, not an error
- [ ] Temporal framing does NOT reintroduce absolute dates that de-identifier removed
  (i.e., `buildSnapshotTimeline` uses `recordedAt` only for relative offset computation,
  never for rendering an absolute date string)

---

## Notes on HIPAA Compatibility

The relative-time framing in `wrapMetricWithAge()` and `buildSnapshotTimeline()` is explicitly
compatible with HIPAA Safe Harbor (45 CFR §164.514(b)). The Safe Harbor method requires removal
of specific dates (other than year), not relative offsets. "3 days ago" is not a date identifier.

The `deidentify.ts` module (Phase 3) strips absolute dates from the snapshot payload. This module
renders only relative offsets derived from `recordedAt`. These two layers are complementary, not
redundant:
- `deidentify.ts`: scrubs PHI FROM the raw payload text before it reaches any LLM
- `temporal.ts`: adds relative-time framing AROUND the data for model comprehension

---

## File Map Summary

```
chorum-ai/
├── drizzle/
│   └── 0020_temporal_awareness.sql   [NEW]
└── src/
    └── lib/
        ├── db/
        │   └── schema.ts              [MODIFIED: +lastConversationAt, +decaysAfterDays]
        ├── learning/
        │   ├── temporal.ts            [NEW]
        │   ├── injector.ts            [MODIFIED: +anchor injection, +touchLastConversation]
        │   └── types.ts               [MODIFIED: +decaysAfterDays on LearningItem]
        └── chorum/
            └── relevance.ts           [MODIFIED: assembleContext() +age labels, +now param]

chorum_v2/
└── src/
    ├── lib/
    │   └── health/
    │       └── temporal.ts            [NEW]
    └── app/
        └── api/
            ├── cron/
            │   └── health-checkup/
            │       └── route.ts       [MODIFIED: +temporal framing]
            └── health/
                └── chat/
                    └── route.ts       [MODIFIED: +temporal framing]
```
