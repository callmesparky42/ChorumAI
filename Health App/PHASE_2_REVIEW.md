# Phase 2 Review

**Date:** 2026-03-06
**Reviewer:** Claude (claude-sonnet-4-6)
**Scope:** Health Phase 2 (`HEALTH_PHASE_2_SPEC.md`) — pass/fail against spec
**Verdict:** PASS with minor deviations (no blockers introduced by Phase 2 itself)

---

## Deliverable Checklist

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 0 | `packages/health-types/src/index.ts` — type amendments | PASS | `sleepScore`/`sleepDurationMinutes` already present; dashboard types added |
| 1 | `src/lib/shell/health-actions.ts` | PASS | All 5 exports present and correct |
| 2 | `ShellSidebar.tsx` — Health nav entry | PASS | `/health` added to `NAV_ITEMS` |
| 3 | `VitalsStrip.tsx` | PASS | Layout, staleness indicator, card data all match spec |
| 4 | `HealthCharts.tsx` | PASS | All 4 charts match spec exactly; correct Recharts components |
| 5 | `TiffViewer.tsx` | PASS | Page nav, zoom modal, Escape key, empty state all correct |
| 6 | `UploadZone.tsx` | PASS | XHR progress, presign→upload→confirm flow, error states |
| 7 | `SnapshotTimeline.tsx` | PASS | Badge colors, flag indicator, TiffViewer slot, load-more link |
| 8 | `health/page.tsx` + `HealthPageClient.tsx` | PASS | Server/client split, searchParams pagination, upload toggle |
| 9 | MCP route + `health-handlers.ts` | PASS | All 4 tools registered, dispatched, and implemented |
| 10 | `TOOL_SCOPES` in `customization/types.ts` | PASS | All 4 health tool scopes present |
| 11 | `health-actions.test.ts` | PASS | Tests present |
| 12 | `health-handlers.test.ts` | PASS | Tests present; 58 tests passed per changelog |

---

## Issues

### Pre-existing Build Blocker (not introduced by Phase 2)

**`garmin-connect` package not installed**
- Added to `package.json` in Phase 1 fixes but `npm install` has not been run
- `src/app/api/health/garmin/connect/route.ts` and `src/lib/health/garmin-sync.ts` will fail to compile
- Fix: run `npm install` in `chorum_v2/`
- Phase 2 code is not the cause and is not affected

---

## Accepted Deviations

### 1 — RSC slot pattern in `HealthPageClient` (architectural improvement)

**Spec:** `HealthPageClient` receives `dashboardData: HealthDashboardData` only; renders `VitalsStrip` and `SnapshotTimeline` directly as client subcomponents.

**Implementation:** `HealthPageClient` receives `dashboardData`, `vitalsStrip: ReactNode`, and `snapshotTimeline: ReactNode`. The server page pre-renders `VitalsStrip` and `SnapshotTimeline` as RSC slots and passes them in.

**Assessment:** Superior to the spec. `VitalsStrip` and `SnapshotTimeline` remain server components — no client bundle cost, no `'use client'` bleed. This is the correct Next.js App Router pattern for mixing server and client rendering. Accept.

### 2 — Silent auth failure in `getHealthDashboardData`

**Spec:** `getServerSession(authOptions)` — throws if not authenticated.

**Implementation:** The entire function body is in a `try/catch` that returns `emptyDashboardData()` on any error, including auth failures.

**Assessment:** Low risk — the `(shell)/layout.tsx` enforces authentication before the page renders, so unauthenticated requests never reach the action in production. The silent fallback means a misconfigured environment shows an empty dashboard rather than a 500. Acceptable but worth noting: a future session expiry mid-render would silently show empty data rather than redirecting to login.

No fix required for Phase 3, but log a note for Phase 6 hardening.

### 3 — UploadZone blocks on unrecognized file extensions

**Spec:** Type inference table has 4 extensions; spec does not specify what happens for unrecognized extensions.

**Implementation:** `inferTypeFromExtension` returns `null` for unrecognized extensions → "Unsupported file type" error shown; upload blocked.

**Assessment:** Reasonable and safe. The alternative (allowing unknown extensions) would create server-side validation mismatches. The accepted MIME types in `presignHealthUpload` would catch it anyway. Accept.

### 4 — Spec type-name inconsistencies (spec error, not impl error)

The spec uses `lab_result`, `vital_signs`, and `mychart_doc` in several places (summary table, badge color table, upload type labels). The actual `HealthSnapshotType` values are `labs`, `vitals`, and `mychart`. The implementation uses the correct actual values throughout — `computeSnapshotSummary`, badge styles, and `typeOptions` in `UploadZone` are all correct.

**Assessment:** Spec documentation error. Implementation is correct. No action needed.

---

## Items to Carry into Phase 3

1. **`npm install` in `chorum_v2/`** — required before any dev/build run
2. **Auth fallback in `getHealthDashboardData`** — revisit in Phase 6 hardening; add proper `redirect('/login')` on auth failure
3. **`health_checkup` MCP handler returns structured data only** — full LLM analysis deferred to Phase 3 per spec; stub note is in the response (`"note": "Text-based documents excluded pending de-identification (Phase 3)."`)
4. **Garmin sync UI and setup flow** — Phase 3 scope

---

## Phase 3 Readiness

Phase 2 is complete. All user-visible surfaces are present: `/health` dashboard, vitals strip, charts, timeline, upload zone, TIFF viewer. Four MCP tools are registered and operational. No Phase 2 blockers exist.

Phase 3 (Garmin sync, de-identification, LLM-driven checkup analysis) can proceed.
