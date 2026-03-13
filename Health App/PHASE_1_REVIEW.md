# Phase 1 Implementation Review

**Date:** 2026-03-06
**Reviewer:** Claude
**Input:** PHASE_1_CHANGELOG_REPORT.md + direct file inspection
**Verdict:** CONDITIONALLY PASSES — 2 build blockers must be resolved before Phase work continues

---

## Overall Assessment

The Phase 1 core implementation is solid. Crypto, audit, snapshot API, TIFF converter, presign,
and confirm routes are all well-written and correctly structured. 28/28 tests pass. The primary
concern is two pre-existing files that block `npm run build`, plus three minor spec deviations
worth documenting.

---

## Checklist Results (from HEALTH_SPEC_V2.md Phase 1 validation)

| Check | Status | Notes |
|-------|--------|-------|
| `HEALTH_ENCRYPTION_KEY !== ENCRYPTION_KEY` assertion throws | PASS | Lines 9–13, crypto.ts |
| `encryptPHI` + `decryptPHI` roundtrip | PASS | Covered by 28/28 tests |
| 100 encrypt calls → 100 unique IVs | PASS | `webcrypto.getRandomValues(16 bytes)` |
| Duplicate `payload_hash` → rejected, no duplicate record | PASS | Dedup query before insert |
| Duplicate `payload_hash` → **409** | FAIL (see Deviation 1) | Returns 200 with `{ created: false }` |
| `phi_audit_log` entry on every POST/GET to snapshots | PASS | `void logPhiAccess(...)` in both handlers |
| TIFF with 3 pages → 3 PNG files in storage | PASS | Covered in tiff.test.ts |
| RLS policies prevent cross-user access | PASS | 0011_health_rls.sql |
| All health routes 401 without valid token | PASS | `authenticate()` guard on all routes |

---

## Build Blockers (must fix before any further phase work)

### BLOCKER 1: `@/lib/health/rate-limit` does not exist

Four files import from this missing module:
- `src/app/api/health/chat/route.ts` — `checkRateLimit`
- `src/app/api/health/chat/stream/route.ts` — `checkRateLimit`, `rateLimitHeaders`
- `src/app/api/health/export/summary/route.ts` — `checkRateLimit`
- `src/app/api/health/trends/labs/route.ts` — `checkRateLimit`

These are pre-existing later-phase files (Phase 5/6 scope). Codex correctly did not remove
them. However, the missing module breaks `npm run build` today.

**Fix:** Create `src/lib/health/rate-limit.ts` as a passthrough stub, clearly marked TODO
for Phase 6 hardening. The stub must export:
- `checkRateLimit(userId: string, endpoint: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }>`
- `rateLimitHeaders(result: { remaining: number; resetAt: Date }): Record<string, string>`

The stub always returns `allowed: true` so no existing routes change behavior.

### BLOCKER 2: `garmin-connect` not in package.json

`src/app/api/health/garmin/connect/route.ts` uses `require('garmin-connect')`. The package
is not installed. This breaks the build.

**Fix:** `npm install garmin-connect` in `chorum_v2/`. The route already handles the lack of
TypeScript types correctly via `require()` with an inline type cast — no additional type work
needed once the package is installed.

---

## Spec Deviations

### Deviation 1: Dedup returns 200 instead of 409 (KEEP — intentional improvement)

**Spec says:** "Duplicate `payload_hash` returns 409, no duplicate record created."

**Implementation:** Returns `{ id, created: false }` with HTTP 200.

**Assessment:** The 200 behavior is deliberately better for mobile clients doing idempotent
sync — the mobile app can sync the same day's Garmin data twice without error handling for
409. The spec's intent (no duplicate record) is fully satisfied. HTTP 200 vs 409 is a client
contract question.

**Decision:** Accept this deviation. Document it in the types. The `CreateSnapshotResponse`
type in `@chorum/health-types` already models `{ id: string; created: boolean }` which makes
the intent clear to callers.

### Deviation 2: `decryptPHI` takes no `key` parameter (KEEP — security improvement)

**Spec says:** `decryptPHI(ciphertext: string, iv: string, key: string): object`

**Implementation:** `decryptPHI(ciphertext: string, iv: string): object` — key is module-level.

**Assessment:** Correct call. Passing the key through call sites creates risk of it appearing
in logs, error traces, or being passed incorrectly. Module-level key loaded once at startup
with a size assertion is more secure. Keep as-is.

### Deviation 3: `ocr_document` in SQL but not in route validation (MINOR — fix)

**Migration 0010** includes `'ocr_document'` in the `health_snapshots_type_check` constraint.

**Routes** (`snapshots/route.ts`, `upload/confirm/route.ts`) do NOT include `'ocr_document'`
in their `snapshotTypes` validation arrays.

**Impact:** A snapshot with `type = 'ocr_document'` cannot be created through the API today
(validation rejects it), but the DB would accept it if inserted directly. Phase 5 adds the
OCR route which will need to create this type.

**Fix:** Add `'ocr_document'` to the `snapshotTypes` const arrays in both route files, AND
add it to `HealthSnapshotType` in `@chorum/health-types`. Do this now so Phase 5 doesn't
have to touch Phase 1 files.

---

## Type Gap

### `delete` missing from `PhiAction` TypeScript type

`audit.ts` defines:
```ts
export type PhiAction = 'view' | 'create' | 'export' | 'decrypt' | 'integrity_failure'
```

The SQL `phi_audit_action_check` constraint includes `'delete'`. The TS type does not.
Phase 6 will add a snapshot delete endpoint. When it does, it will need this action.

**Fix:** Add `'delete'` to `PhiAction` now so the type matches the DB constraint.

---

## Items Confirmed Clean (no action needed)

- `crypto.ts`: Key size assertion (32 bytes), GCM auth tag packed into ciphertext, canonical
  JSON for hashing — all correct.
- `audit.ts`: `void insertAuditEntry(...).catch(...)` pattern — fire-and-forget with no
  uncaught rejection, correctly never blocks callers.
- `snapshots/route.ts`: Auth guard, Zod validation, dedup, encrypt, audit on both POST and
  GET — all present and in correct order.
- `tiff.ts`: Page cap at 50, per-page error isolation (continue on fail), original deletion
  only if at least one page succeeded, signed Supabase client — all correct.
- `presign/route.ts`: UUID storage key, MIME allowlist, 50MB cap, no audit needed (no PHI
  accessed at presign stage) — all correct.
- `confirm/route.ts`: User-path prefix guard (`health-uploads/{userId}/`), TIFF conversion
  inline, `tiff_too_large` 422 on page cap breach, audit logged — all correct.
- `health-schema.ts`: `pgSchema('auth')` pattern for FK to auth.users — correct approach
  for Supabase auth schema references in Drizzle.
- Migration `0010`: Dedup unique index on `(user_id, payload_hash)` — present and correct.
- `garmin_sync_state` and `health_user_settings` in schema.ts but not in 0010 migration —
  acceptable; schema.ts is for TS type inference, migrations are the source of truth for DDL.

---

## Required Actions Before Proceeding

Priority order:

1. **[BLOCKER]** Create `src/lib/health/rate-limit.ts` stub
2. **[BLOCKER]** Install `garmin-connect` package
3. **[MINOR]** Add `'ocr_document'` to route `snapshotTypes` arrays and `HealthSnapshotType`
4. **[MINOR]** Add `'delete'` to `PhiAction` in `audit.ts`
5. **[HUMAN]** Apply migrations 0010, 0010b, 0011 to health Supabase project
6. **[HUMAN]** Apply migration 0012 to core Supabase project
7. **[HUMAN]** Confirm `health-uploads` bucket exists and is private
8. **[HUMAN]** Confirm all `HEALTH_*` env vars set in Vercel and `.env.local`

Items 1–4 are code fixes I will implement. Items 5–8 require human action.

After items 1–4 are resolved, `npm run build` should pass and Phase temporal implementation
can begin.
