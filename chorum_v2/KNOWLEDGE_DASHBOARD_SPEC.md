# Knowledge Dashboard Spec
## Chorum v2 — Conductor Intelligence Layer

**Route:** `/dashboard/knowledge`
**Status:** Unimplemented — spec for implementation
**Implementer note:** Self-executing spec. Complete all phases in order. Each phase has a validation checklist.

---

## Vision

The Knowledge Dashboard is the control room for the Conductor. It surfaces:

1. The **health and shape** of the knowledge base (decay, confidence, domain distribution)
2. The **connected app registry** — first-party apps that feed learnings into the Conductor, named and mapped like DNS records
3. The **provenance chain** — which app produced which learning, tied to which project

The dashboard should feel like a monitoring console, not a settings page. Graphical, dense, and live.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Knowledge Dashboard                          [Global time range picker]  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  CONNECTED APPS         │  │  CORPUS HEALTH                       │  │
│  │  (App Registry)         │  │  (Aggregate stats strip)             │  │
│  └─────────────────────────┘  └──────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  DECAY MAP  (full-width area chart)                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  DOMAIN RADAR           │  │  CONFIDENCE DISTRIBUTION             │  │
│  │  (radar/spider chart)   │  │  (horizontal bar breakdown)          │  │
│  └─────────────────────────┘  └──────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  LEARNING FEED  (filterable table with provenance column)        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Section 1: Connected Apps (App Registry)

### Concept

Every app that writes learnings into the Conductor registers with a **slug** — a short identifier like a DNS name (`chorum-health`, `midnight-musings`, `chorum-core`). The dashboard displays each registered app as a card. Clicking a card filters the entire dashboard to show only that app's contributions.

### App Registry Card

Each card shows:

```
┌─────────────────────────────────┐
│  ● chorum-health                │  ← slug (monospace)
│  Chorum Health                  │  ← display name
│                                 │
│  127 learnings  ·  4 projects   │
│  Last activity: 2 hours ago     │
│                                 │
│  [████████░░] 82% healthy       │  ← decay health bar
└─────────────────────────────────┘
```

Status indicator dot colors:
- Green `●` — active (last write < 24h)
- Yellow `●` — idle (last write 1–7 days)
- Gray `●` — dormant (last write > 7 days)
- Red `●` — error state (failed writes in audit log)

### App Registration Schema

Add to `src/db/schema.ts`:

```typescript
export const conductorApps = pgTable('conductor_apps', {
  id:          uuid('id').primaryKey().defaultRandom(),
  slug:        text('slug').notNull().unique(),       // e.g. 'chorum-health'
  displayName: text('display_name').notNull(),        // e.g. 'Chorum Health'
  description: text('description'),
  iconUrl:     text('icon_url'),
  apiKeyHash:  text('api_key_hash'),                  // hashed key for app-to-Conductor auth
  ownerId:     uuid('owner_id').notNull(),            // references users.id
  active:      boolean('active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastWriteAt: timestamp('last_write_at', { withTimezone: true }),
})
```

Add `sourceApp` column to `projectLearningPaths`:

```typescript
sourceApp: text('source_app'),  // FK-lite to conductorApps.slug; nullable (core learnings have null)
```

Migration files needed:
- `drizzle/XXXX_conductor_apps.sql` — create `conductor_apps` table
- `drizzle/XXXX_learning_source_app.sql` — add `source_app` column to `project_learning_paths`

Seed three built-in app records (owned by system/admin):
- `{ slug: 'chorum-core', displayName: 'Chorum', description: 'Native Conductor learnings from chat sessions' }`
- `{ slug: 'chorum-health', displayName: 'Chorum Health', description: 'Health snapshot insights and checkup learnings' }`
- `{ slug: 'midnight-musings', displayName: 'Midnight Musings', description: 'Capture and reflection entries' }`

### App-level Filtering

When a card is clicked, all sections below (Decay Map, Domain Radar, Confidence Distribution, Learning Feed) filter to that app's slug. The active filter appears as a pill above the charts:

```
Filtering by: [chorum-health ×]
```

---

## Section 2: Corpus Health Strip

A single horizontal strip of 5 stat tiles — always unfiltered (shows full Conductor health regardless of app filter):

| Tile | Value | Sub-label |
|------|-------|-----------|
| Total Learnings | 1,204 | across all projects |
| Active (non-decayed) | 847 | > 20% strength |
| Pinned | 23 | always injected |
| Muted | 11 | never injected |
| Avg Confidence | 0.71 | corpus mean |

Tiles use large monospace numerals with a muted label below. No sparklines here — the charts below handle trends.

---

## Section 3: Decay Map

### Description

Full-width stacked area chart. X-axis = time (14 / 30 / 90 days, switchable). Y-axis = count of learning items binned by decay strength bracket.

### Decay Strength Brackets (stacked areas)

| Bracket | Range | Color |
|---------|-------|-------|
| Fresh | 80–100% | `#34d399` (green) |
| Active | 50–80% | `#60a5fa` (blue) |
| Fading | 20–50% | `#fbbf24` (amber) |
| Dormant | 0–20% | `#f87171` (red) |
| Pinned | N/A (override) | `#a78bfa` (purple) |

Pinned items render as a flat band at the top — they don't decay so they stay constant.

### Interactions

- Hover tooltip: date, count per bracket, total active
- When an app filter is active, non-selected app areas render at 20% opacity (ghost layer), selected app renders at full opacity — so you can see the app's contribution within the whole corpus
- Click a date point → Learning Feed below jumps to that day's entries

### Data Source

Server action `getDecayTimeSeries({ days, sourceApp? })` — queries `project_learning_paths`, computes `decayStrength` from `lastAccessedAt` + `usageCount` using the existing decay formula, groups by date bucket.

---

## Section 4: Domain Radar

### Description

Spider/radar chart. Each axis = a domain from the Conductor domain taxonomy. The plotted value = count of learnings in that domain (weighted by confidence score, so high-confidence items count more).

### Axes (domains — match existing classifier domains)

- Architecture
- Debugging
- Performance
- Security
- UX / Design
- Data / Schema
- DevOps / Infra
- Product / Strategy
- Testing
- Documentation

### Multi-series overlay

When an app filter is active, render two series:
1. Full corpus (light, dashed outline)
2. Selected app (solid fill, colored by app)

This lets you see at a glance: "Health is predominantly Data/Schema and Security; Musings is predominantly Product/Strategy."

### Data Source

Server action `getDomainDistribution({ sourceApp? })` — aggregates `domain` field from `project_learning_paths`, weighted by `confidenceScore`.

---

## Section 5: Confidence Distribution

### Description

Horizontal segmented bar — a single bar broken into confidence buckets, with count and percentage labels per segment.

```
Confidence Distribution

[██████████████░░░░░░░░░░░░░░░]
High (>0.8)    Medium (0.5–0.8)    Low (<0.5)
   412 (34%)       603 (50%)        189 (16%)
```

Below the bar: a small table showing the **top 5 highest-confidence learnings** with columns: `Title`, `Project`, `App`, `Score`, `Last used`.

These top-5 rows are clickable — clicking opens a right-side drawer with the full learning detail (type, content, injection history, decay curve for that single item).

### Single-Item Decay Drawer

When a learning is selected, a right drawer slides in showing:

- Learning title and type badge (Pattern / Rule / How-to / Avoid)
- Source app pill (e.g. `chorum-health`)
- Project link
- Confidence score with bar
- Decay curve: a small line chart — this specific item's `decayStrength` over the past 30 days (requires daily snapshot data or computed from `lastAccessedAt` + `usageCount` at render time)
- Injection history: list of last 10 chat sessions where this item was injected (date, project, tier used)
- Actions: `Pin` / `Mute` / `Delete` buttons

---

## Section 6: Learning Feed

### Description

Paginated table (25 rows/page) — the raw learning items, filterable and sortable. This is the "audit log" of the Conductor.

### Columns

| Column | Description |
|--------|-------------|
| Type | Badge: Pattern / Rule / Avoid / How-to |
| Title | Truncated, clickable (opens detail drawer) |
| Project | Project name |
| App | Source app slug pill (e.g. `chorum-health`) — gray pill for core |
| Confidence | Score bar (0–1) |
| Strength | Decay strength % |
| Last Used | Relative time |
| Status | Pin / Mute / Active / Dormant badge |

### Filters (above table)

- App filter (multi-select pills matching registry cards)
- Type filter (Pattern / Rule / Avoid / How-to)
- Status filter (Active / Pinned / Muted / Dormant)
- Domain filter (dropdown multi-select)
- Search (full-text on title/content)
- Sort: Confidence ↑↓ / Strength ↑↓ / Last Used ↑↓ / Created ↑↓

### Inline Actions

Each row has a `···` menu:
- Pin / Unpin
- Mute / Unmute
- Edit (opens detail drawer in edit mode)
- Delete (confirm dialog)

---

## Data Layer

### Server Actions (add to `src/lib/shell/actions.ts` or new `src/lib/shell/knowledge-actions.ts`)

```typescript
getConnectedApps(userId: string): Promise<AppRegistryEntry[]>
// Returns all conductor_apps owned by user with aggregate stats:
// learningCount, projectCount, lastWriteAt, decayHealthPercent

getCorpusHealth(userId: string): Promise<CorpusHealthStats>
// total, active, pinned, muted, avgConfidence

getDecayTimeSeries(userId: string, days: 14 | 30 | 90, sourceApp?: string): Promise<DecayTimePoint[]>
// Each point: { date, fresh, active, fading, dormant, pinned }

getDomainDistribution(userId: string, sourceApp?: string): Promise<DomainPoint[]>
// Each point: { domain, weightedCount }

getConfidenceDistribution(userId: string, sourceApp?: string): Promise<ConfidenceStats>
// { high, medium, low, topItems: LearningItem[] }

getLearnings(userId: string, filters: LearningFilters, page: number): Promise<PaginatedLearnings>
// Paginated, filtered, sorted

getLearningDetail(userId: string, id: string): Promise<LearningDetail>
// Full item including injection history
```

### Recharts Components (consistent with existing shell charts)

- `DecayMap` — `AreaChart` with four `Area` stacked, one for pinned
- `DomainRadar` — `RadarChart` with one or two `Radar` series
- `ConfidenceBar` — custom SVG segmented bar (simple enough to do without Recharts)

---

## Route Structure

```
src/app/(shell)/dashboard/knowledge/
  page.tsx          — RSC, fetches all server action data, renders layout
  loading.tsx       — skeleton placeholders matching chart dimensions
  error.tsx         — standard error boundary

src/components/knowledge/
  AppRegistryCard.tsx
  AppRegistryGrid.tsx
  CorpusHealthStrip.tsx
  DecayMap.tsx
  DomainRadar.tsx
  ConfidenceBar.tsx
  LearningFeed.tsx
  LearningDetailDrawer.tsx
  KnowledgeFilterBar.tsx
```

All components are client components (`'use client'`) except `page.tsx` which is an RSC that fetches and passes data down as props.

---

## Navigation

Add to the shell sidebar (`src/components/shell/ShellSidebar.tsx`) under a "Platform" section:

```
Platform
  Knowledge Dashboard     ← new
```

---

## Migrations Required

1. `conductor_apps` table
2. `source_app` column on `project_learning_paths`
3. Seed built-in app slugs (chorum-core, chorum-health, midnight-musings)

The implementer should write these migrations, apply them, and confirm existing learnings get `source_app = 'chorum-core'` as the default backfill.

---

## Out of Scope (Phase 2 of this feature)

- Live WebSocket updates (decay strength updating in real time)
- App API key issuance UI (first-party apps currently hard-coded; key management UI deferred)
- Cross-user app sharing / multi-tenant app registry
- App-level rate limiting dashboard

---

## Validation Checklist

- [ ] `conductor_apps` table exists with seed data
- [ ] `source_app` column on `project_learning_paths`, backfilled
- [ ] App Registry cards render with correct stats and status dots
- [ ] App filter pill applies across all chart sections
- [ ] Decay Map renders stacked areas; ghost overlay works when filtered
- [ ] Domain Radar shows dual-series when app filter active
- [ ] Confidence Distribution bar correct percentages; top-5 rows clickable
- [ ] Learning Detail Drawer opens, shows decay curve, actions work (pin/mute/delete)
- [ ] Learning Feed filters, sorts, paginates correctly
- [ ] Provenance column (`App`) shows correct slug per row
- [ ] `/dashboard/knowledge` is reachable from sidebar
- [ ] `loading.tsx` skeletons match chart dimensions (no layout shift)
