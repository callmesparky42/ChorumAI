# PHASE 6 CHANGELOG REPORT

Date: 2026-03-07
Project: Chorum Health (Phase 6)
Execution Location: `chorum_v2` + `Health App` docs

## Summary
Phase 6 implementation is now in place across backend APIs, cron jobs, security tooling, and mobile UX.
The Phase 6 spec targets were implemented for real rate limiting, integrity verification, retention administration, push receipt handling, biometric gating, SSE chat streaming, key rotation, and cron scheduling.

## Backend Changes

### Created
- `src/lib/health/integrity.ts`
  - Added snapshot integrity verification primitives:
    - `verifySnapshot(...)`
    - `verifyBatch(...)`
  - Added integrity failure audit logging (`integrity_failure`).

- `src/app/api/cron/health-integrity-check/route.ts`
  - Added weekly integrity cron endpoint.
  - Samples approximately 20% of rows (`TABLESAMPLE BERNOULLI`) up to a hard cap.
  - Groups checks by user and returns checked/passed/failed/failure summary.
  - Supports `GET` and `POST`.

- `src/app/api/health/admin/retention/route.ts`
  - Added retention admin API:
    - `GET` retention days from user settings.
    - `PATCH` upsert/validate retention days.
    - `DELETE` purge user snapshots (with audit logging).

- `src/app/api/health/admin/alerts/route.ts`
  - Added alert-threshold admin API:
    - `GET` parsed thresholds.
    - `PATCH` persisted JSON threshold config.

- `src/app/api/cron/health-data-retention/route.ts`
  - Added monthly retention purge cron.
  - Deletes out-of-retention snapshots per user setting and logs deletes.
  - Supports `GET` and `POST`.

- `src/app/api/health/push/receipts/route.ts`
  - Added Expo receipt-check endpoint.
  - Batches receipt lookups and deactivates `DeviceNotRegistered` tokens best-effort.

- `src/app/api/cron/health-push-receipts/route.ts`
  - Added cron scaffold for push receipt processing (safe no-op placeholder response).
  - Supports `GET` and `POST`.

- `src/scripts/rotate-health-key.ts`
  - Added key rotation script:
    - decrypt old ciphertext
    - encrypt with new key
    - recompute hash
    - cursor-based batches with transaction and guarded retries

### Updated
- `src/lib/health/rate-limit.ts`
  - Replaced stub limiter with real sliding-window implementation.
  - Added endpoint-specific limit map:
    - `snapshots:write`, `snapshots:read`, `trends`, `garmin:connect`, `garmin:sync`, `ocr`, `push:register`, `chat`, `sources`, `default`
  - Added in-memory sliding-window fallback for local/dev/no-Upstash mode.
  - Added Upstash path (`@upstash/ratelimit` + `@upstash/redis`) with fail-open behavior.
  - Standardized reset semantics to epoch time and response headers.

- `src/app/api/health/snapshots/route.ts`
  - Applied route-specific rate limiting:
    - `POST` -> `snapshots:write`
    - `GET` -> `snapshots:read`
  - Added standardized 429 headers.
  - Minor typing hardening for optional fields/audit payload shape.

- `src/app/api/health/trends/route.ts`
  - Applied `trends` rate limit and standardized 429 headers.
  - Minor date extraction typing hardening (`slice(0, 10)`).

- `src/app/api/health/garmin/connect/route.ts`
  - Applied `garmin:connect` rate limit to `POST` and `DELETE`.

- `src/app/api/health/garmin/sync/route.ts`
  - Applied `garmin:sync` rate limit to `POST`.

- `src/app/api/health/upload/ocr/route.ts`
  - Standardized existing `ocr` limiter rejection to return 429 headers.

- `src/app/api/health/push/register/route.ts`
  - Applied `push:register` rate limit to `POST` and `DELETE`.

- `src/lib/customization/health-handlers.ts`
  - Added MCP health sources rate limit check (`checkRateLimit('mcp', 'sources')`).
  - Throws `HealthMcpError` when limit exceeded.
  - Minor CreateSnapshot typing normalization.

- `src/lib/health/alert-evaluator.ts`
  - Updated to parse stored threshold JSON text from settings before evaluation.

- `src/app/api/health/chat/route.ts`
- `src/app/api/health/export/summary/route.ts`
- `src/app/api/health/trends/labs/route.ts`
  - Standardized rate-limit response headers behavior for consistency.

- `src/app/api/health/chat/stream/route.ts`
  - Changed from single-event response to chunked token SSE output (`token` frames + `done`).

## Mobile Changes

### Created
- `apps/health-mobile/lib/biometric.ts`
  - Added biometric capability check and prompt helpers.

- `apps/health-mobile/components/BiometricGate.tsx`
  - Added reusable biometric gate wrapper component.

### Updated
- `apps/health-mobile/app/(tabs)/upload.tsx`
  - Wrapped upload flow in biometric gate when opening upload sheet.

- `apps/health-mobile/lib/api.ts`
  - Added `streamChat(message)` SSE async generator for `/api/health/chat/stream`.
  - Parses framed `data:` payloads (`token`, `done`, `error`, `[DONE]`).

- `apps/health-mobile/app/(tabs)/chat.tsx`
  - Upgraded chat UX to stream assistant output incrementally via SSE.

## Infra / Config Changes

### Updated
- `vercel.json`
  - Added Phase 6 cron entries:
    - `/api/cron/health-integrity-check` -> `0 2 * * 0`
    - `/api/cron/health-data-retention` -> `0 3 1 * *`
    - `/api/cron/health-push-receipts` -> `0 */1 * * *`

## Dependency Changes

### Installed
- `@upstash/ratelimit`
- `@upstash/redis`

## Explicit Overwrite / Rewrite Decisions
- `src/lib/health/rate-limit.ts` was intentionally **rewritten in place** from Phase 3-style stub behavior to a real endpoint-aware sliding-window limiter.
- Existing API routes were **updated in place** rather than replaced, to preserve current contracts and existing auth/audit logic.
- `src/app/api/health/chat/stream/route.ts` was **rewritten in place** for token streaming semantics while keeping the same endpoint.
- No Phase 1-5 changelog/report files were overwritten.
- New Phase 6 capabilities were added as **new files** where possible (integrity/cron/admin/receipts/biometric/key-rotation), minimizing disruptive rewrites.
- No destructive repository cleanup or unrelated revert operations were performed.

## Auth / Security Behavior Notes
- Cron endpoints added in Phase 6 accept either:
  - `x-cron-secret`
  - or `Authorization: Bearer <secret>`
- Rate limiter remains fail-open on provider/runtime failure to avoid accidental health API outage.

## Validation Run

### Passed
- `npm test -- src/__tests__/health/snapshots.test.ts`
  - Result: 14/14 tests passed.

### Targeted touched-file typecheck verification
- `npx tsc --noEmit` with touched-file filtering:
  - No remaining hits for Phase 6 touched files listed above.

### Repository-wide pre-existing blockers (not resolved in this phase)
- `npx tsc --noEmit --pretty false` still fails due pre-existing strict typing issues outside Phase 6 scope, including:
  - multiple `src/__tests__/health/*.test.ts` strictness issues
  - `src/app/api/health/upload/confirm/route.ts`
  - `src/components/shell/health/HealthCharts.tsx`
  - `src/components/shell/health/VitalsStrip.tsx`
  - `src/lib/health/garmin-sync.ts`
  - `src/lib/health/health-chat.ts`
  - `src/lib/health/trend-math.ts`
  - `src/lib/shell/health-actions.ts`

## Final State
Phase 6 deliverables are implemented and documented. The health module now has production-grade rate limiting, integrity and retention operational scaffolding, push receipt flow hooks, biometric upload gating, and streamed mobile chat behavior. Repository-wide TypeScript cleanup remains an existing follow-up track.
