# Phase 1 Changelog Report

**Date:** 2026-03-06  
**Authoring Agent:** Codex (GPT-5)  
**Execution Context:** `C:\Users\dmill\Documents\GitHub\ChorumAI\Health App` (spec docs) + `..\chorum_v2`, `..\packages`, `..\package.json` (implementation targets)

## 1) Summary

This report confirms Phase 1 execution work completed from `HEALTH_PHASE_1_SPEC.md` with explicit notes on overwrite/rewrite decisions.

Primary outcome: Phase 1 foundation artifacts are now present/updated in the monorepo target paths (types, schema/client, migrations, crypto, audit, TIFF converter, snapshot/upload routes, and health tests).

## 2) Read/Execution Confirmation

- Phase 1 spec was read fully before implementation (all sections including invariants, error handling, completion criteria, and deferrals).
- Existing repo state was audited first because health files already existed and included mixed Phase 1+later-phase work.
- Implementation proceeded as **verify + correct** against locked Phase 1 decisions.

## 3) File-by-File Change Log

### Verified Existing / Kept

- `..\package.json`
  - Verified workspace config was already present and compliant (`chorum_v2`, `packages/*`, `apps/*`).
  - No rewrite performed.
- `..\packages\health-types\package.json`
  - Verified existing package manifest matched Phase 1 requirement.
  - No rewrite performed.

### Modified

- `..\packages\health-types\src\index.ts`
  - Reworked types to align with Phase 1 contracts and current implementation naming.
  - Added/updated API contracts for snapshots and upload routes.
  - Added chart interfaces and retained trend interfaces used elsewhere.
  - Added compatibility-oriented source/type support (`system`, optional compatibility payload fields) to avoid breaking existing in-repo consumers.

- `..\chorum_v2\src\db\health-schema.ts`
  - Added `auth.users` references using `pgSchema('auth')`.
  - Updated `healthSnapshots.userId` and `pushTokens.userId` to reference auth users with cascade delete.
  - Kept existing additional tables already in repo (not removed) to avoid destructive cross-phase breakage.

- `..\chorum_v2\src\db\health.ts`
  - Updated `HEALTH_DATABASE_URL` missing error message to Phase 1 wording intent.

- `..\chorum_v2\drizzle\0010_health_schema.sql`
  - Replaced with Phase-1-aligned table/index/check constraint structure.
  - Added source/type checks and `phi_audit_log` action check.
  - Removed `garmin_sync_state` from this migration (Phase 3 table).

- `..\chorum_v2\drizzle\0010b_health_seed.sql`
  - Updated trusted source seed list to Phase 1 set.

- `..\chorum_v2\drizzle\0011_health_rls.sql`
  - Replaced policies with Phase 1 RLS coverage for `health_snapshots`, `phi_audit_log`, `push_tokens`.
  - Removed `garmin_sync_state` policy from this migration (Phase 3 scope).

- `..\chorum_v2\drizzle\0012_health_persona.sql`
  - Kept structure already close to repo schema, adjusted `max_tokens` to `4096` per Phase 1.

- `..\chorum_v2\package.json`
  - Added `sharp` dependency for TIFF conversion runtime.

### Rewritten (Delete + Recreate)

- `..\chorum_v2\src\lib\health\crypto.ts`
  - Rewritten to enforce module-load key assertions, canonical hash behavior, AES-256-GCM encryption/decryption behavior, and custom `HealthDecryptionError`.
  - Includes compatibility behavior:
    - `encryptPHI` returns `{ ciphertext, iv, tag }` (for existing code compatibility).
    - `decryptPHI` supports `iv` and legacy `iv:tag` shape.

- `..\chorum_v2\src\lib\health\audit.ts`
  - Rewritten to use health Supabase service key client and fire-and-forget insert pattern.
  - Failures are console-logged and never block callers.

- `..\chorum_v2\src\app\api\health\snapshots\route.ts`
  - Rewritten for Phase 1 POST/GET behavior:
    - auth guard,
    - Zod validation,
    - payload hashing + dedup,
    - encryption/decryption,
    - audit logging,
    - filter params and failed decrypt counting.

### Added New Files

- `..\chorum_v2\src\lib\health\tiff.ts`
  - Added TIFF->PNG conversion module with page cap and storage I/O behavior.

- `..\chorum_v2\src\app\api\health\upload\presign\route.ts`
  - Added presign endpoint with MIME/size checks and signed upload URL generation.

- `..\chorum_v2\src\app\api\health\upload\confirm\route.ts`
  - Added confirm endpoint with user path prefix validation, TIFF conversion integration, snapshot creation, and error behavior.

- `..\chorum_v2\src\__tests__\health\crypto.test.ts`
  - Added required encryption/hash/key-assertion coverage.

- `..\chorum_v2\src\__tests__\health\snapshots.test.ts`
  - Added required snapshot route behavior tests (auth, validation, dedup, audit call, decrypt failures, filters).

- `..\chorum_v2\src\__tests__\health\tiff.test.ts`
  - Added TIFF conversion tests including page cap, corrupt-page skip, and original deletion behavior.

## 4) Overwrite/Rewrite Decisions (Explicit)

1. **Delete + recreate** was used where existing file shape materially conflicted with Phase 1 contracts:
   - `crypto.ts`
   - `audit.ts`
   - `snapshots/route.ts`

2. **Migration correction** was applied by rewriting Phase 1 migration files rather than introducing new migration numbers, because the spec locks these filenames and semantics for Phase 1.

3. **Compatibility retention decisions** were intentionally made to avoid immediate regressions in already-present later-phase code:
   - `HealthSnapshotSource` includes `'system'` in shared types and route validation.
   - `crypto.ts` continues exposing `tag` and accepts legacy `iv:tag` format while preserving Phase 1 ciphertext contract support.
   - Type file retains trend-related interfaces already consumed by existing routes.

4. **Non-destructive policy** was followed:
   - No unrelated pre-existing repo changes were reverted.
   - Existing later-phase files were not removed.

## 5) Validation Performed

### Passing

Command run from `..\chorum_v2`:

- `npm run test -- src/__tests__/health/crypto.test.ts src/__tests__/health/snapshots.test.ts src/__tests__/health/tiff.test.ts`
  - Result: **28/28 tests passed** (3 test files passed).

### Failing (Known Existing Blockers Outside This Phase Patch)

- `npm run build`
  - Fails due unresolved modules in already-existing routes:
    - `@/lib/health/rate-limit`
    - `garmin-connect`
  - These are not introduced by this changelog write and were present in current repo state.

## 6) Human/Environment Tasks Still Required

- Apply health migrations (`0010`, `0010b`, `0011`) to health Supabase project.
- Apply persona/domain migration (`0012`) to core Supabase project.
- Ensure private `health-uploads` bucket exists in health Supabase.
- Confirm required env vars in Vercel and local environment:
  - `HEALTH_DATABASE_URL`
  - `HEALTH_SUPABASE_URL`
  - `HEALTH_SUPABASE_SERVICE_KEY`
  - `HEALTH_ENCRYPTION_KEY`
  - `GARMIN_CRON_SECRET`

## 7) Handoff Status

Phase 1 implementation changes are documented and saved. Ready to begin Phase 2 when instructed.
