# PHASE 5 REVIEW

Date: 2026-03-07
Reviewer: Claude Code
Verdict: **PASS** (one build blocker fixed during review)

---

## Files Reviewed

### Backend

| File | Status | Notes |
|------|--------|-------|
| `src/lib/health/ocr.ts` | PASS | Three provider paths (Anthropic/OpenAI/Google), fence-stripped JSON, `normalizeExtraction`, de-identification applied, correct exports |
| `src/app/api/health/push/register/route.ts` | PASS | Expo token format validation, upsert on conflict, active=false on DELETE |
| `src/app/api/health/push/notify/route.ts` | PASS | Cron-secret auth via `GARMIN_CRON_SECRET`, chunked Expo push (100/batch), DeviceNotRegistered auto-deactivation |
| `src/app/api/cron/health-push-digest/route.ts` | PASS | Dual GET+POST, `HEALTH_PUSH_DIGEST_SECRET` auth, per-user `checkup_result` fetch, `summarizeCheckup` first-sentence extraction, `Promise.allSettled` aggregation |
| `src/app/api/health/upload/ocr/route.ts` | PASS | Auth, rate limit, ownership prefix check, TIFF/PDF/JPEG/PNG branch logic, hash dedup (skips update on duplicate), encrypted snapshot update, PHI audit log, correct response shape |
| `src/app/api/health/chat/route.ts` (non-streaming) | PASS | Returns `{ content: string }` — matches mobile `api.ts` expectation |
| `src/app/api/health/chat/stream/route.ts` | PASS | SSE stream, matches Phase 4 fix (no `snapshotCount` destructure) |
| `vercel.json` | PASS | Cron `15 8 * * 1` added for digest |

### Mobile

| File | Status | Notes |
|------|--------|-------|
| `apps/health-mobile/components/CameraOCR.tsx` | PASS | Permission gate, camera/library flows, presign→PUT→confirm→OCR pipeline, mimeType detection, stage machine (preview/uploading/processing/error) |
| `apps/health-mobile/components/UploadSheet.tsx` | PASS | Bottom sheet, `autoLaunchLibrary` flag for Choose File path, fullscreen Modal wrapping CameraOCR |
| `apps/health-mobile/components/TiffViewer.tsx` | PASS | Horizontal paged scroll, Supabase URL construction with segment encoding, page indicator |
| `apps/health-mobile/app/(tabs)/upload.tsx` | PASS | UploadSheet integration, in-session upload list (does not persist — intentional for Phase 5) |
| `apps/health-mobile/app/(tabs)/timeline.tsx` | PASS | Loads snapshots via `getSnapshots`, ICD page detection from `payload.storagePages`/`payload.pngPages`/`storagePath`, TiffViewer modal |
| `apps/health-mobile/app/(tabs)/chat.tsx` | PASS | Message history, welcome message excluded from API history, sends to non-streaming `/api/health/chat`, error messages surfaced as assistant bubbles |
| `apps/health-mobile/app/_layout.tsx` | PASS | `GestureHandlerRootView` wrapper, push token registration on auth state, PKCE code exchange |
| `apps/health-mobile/lib/push.ts` | PASS | Permission flow, Android notification channel, projectId lookup from `expoConfig` or `easConfig`, best-effort server registration |
| `apps/health-mobile/lib/api.ts` | PASS | All required helpers present: `registerPushToken`, `unregisterPushToken`, `triggerOCR`, `chat`, `getSnapshots`; HTTP errors include status+text |

---

## Fix Applied During Review

### `src/db/schema.ts` — Duplicate `mobileAuthCodes` declaration (BUILD BLOCKER)

**Root cause:** Phase 4 review added the table at the insertion point before `conversations`; Phase 5 Codex also added it (with an expiry index) earlier in the file. This caused a TypeScript duplicate identifier error.

**Fix:** Removed the simpler duplicate (no-index version inserted during Phase 4). The keeper is the Phase 5 version at line 329 with `index('mobile_auth_codes_expiry').on(table.expiresAt)`.

Also removed two orphaned `// Table: conversations` comment headers that were left interleaved with the duplicate.

---

## Pre-existing Issues (Not Introduced by Phase 5)

These were documented in the Phase 5 changelog and confirmed during review. Not blocking Phase 5 work but should be resolved before production:

- `npx tsc --noEmit` fails on `HealthCharts.tsx` (unrelated to Phase 5 files)
- `npx tsc --noEmit` fails on test files with strict-type issues
- These were present before Phase 5 and not touched by Codex

---

## Compatibility Notes

- Mobile `api.ts` calls `/api/health/chat` (non-streaming). The streaming endpoint at `/api/health/chat/stream` is implemented and ready for a Phase 6 SSE upgrade with no mobile-side rework required beyond swapping the `chat()` helper.
- `TiffViewer` constructs Supabase storage URLs using `EXPO_PUBLIC_HEALTH_SUPABASE_URL` — ensure this env var is set in the Expo build config.
- `registerPushToken` requires `eas.projectId` in `app.json` extra config or `easConfig` — standard EAS setup.
- OCR route uses `HEALTH_SUPABASE_URL` + `HEALTH_SUPABASE_SERVICE_KEY` for storage access — already required by prior phases.

---

## Ready for Phase 6
