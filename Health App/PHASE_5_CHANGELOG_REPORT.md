# PHASE 5 CHANGELOG REPORT

Date: 2026-03-07
Project: Chorum Health (Phase 5)
Execution Location: `chorum_v2` + `Health App` docs

## Summary
Phase 5 implementation is now in place for backend OCR/push infrastructure and mobile OCR/upload/timeline/chat UX.
All missing Phase 5 targets identified at start were implemented, and the digest cron schedule was added.

## Backend Changes

### Created
- `src/lib/health/ocr.ts`
  - Added OCR extraction module with:
    - vision/text extraction entrypoints: `extractFromImage`, `extractFromText`
    - provider selection from user-configured providers
    - provider-specific vision calls (Anthropic/OpenAI-compatible/Google)
    - JSON parsing + de-identification + payload normalization

- `src/app/api/health/upload/ocr/route.ts`
  - Added OCR trigger endpoint.
  - Flow implemented:
    - auth + rate limit
    - snapshot ownership validation
    - storage download
    - branch by file type (PDF/TIFF/JPEG/PNG)
    - PDF text extraction path via existing `pdf.ts`
    - TIFF conversion path via existing `convertTiffToPng`
    - OCR extraction + encrypted snapshot update
  - Response implemented: `{ id, documentType, confidence, pageCount, pngPages }`.

- `src/app/api/health/push/register/route.ts`
  - Added push token register/unregister endpoints.
  - POST stores/upserts token; DELETE sets `active=false`.

- `src/app/api/health/push/notify/route.ts`
  - Added internal push send endpoint (cron-secret protected).
  - Sends to Expo push API and deactivates `DeviceNotRegistered` tokens.

- `src/app/api/cron/health-push-digest/route.ts`
  - Added weekly digest cron endpoint.
  - Collects active-token users, loads latest `checkup_result`, derives short summary, and dispatches via notify endpoint.

### Updated
- `vercel.json`
  - Added cron entry:
    - `/api/cron/health-push-digest` at `15 8 * * 1`

## Mobile Changes

### Created
- `apps/health-mobile/lib/push.ts`
  - Added Expo notification permission/token registration helper.

- `apps/health-mobile/components/CameraOCR.tsx`
  - Added full camera/library -> presign -> upload -> confirm -> OCR trigger flow.

- `apps/health-mobile/components/TiffViewer.tsx`
  - Added paged TIFF-PNG viewer.

- `apps/health-mobile/components/UploadSheet.tsx`
  - Added bottom sheet with Scan / Choose File / Manual Entry options.

### Rewritten (Phase 4 stubs replaced)
- `apps/health-mobile/app/(tabs)/upload.tsx`
  - Replaced "Coming in Phase 5" stub with functional upload screen and sheet integration.

- `apps/health-mobile/app/(tabs)/timeline.tsx`
  - Replaced stub with snapshot timeline loaded from API.
  - Added ICD row behavior to open `TiffViewer` modal when page keys are present.

- `apps/health-mobile/app/(tabs)/chat.tsx`
  - Replaced stub with functional non-streaming health chat UI using `/api/health/chat`.

### Updated in place
- `apps/health-mobile/lib/api.ts`
  - Added helpers:
    - `registerPushToken`
    - `unregisterPushToken`
    - `triggerOCR`
    - `chat`
    - `getSnapshots`
  - Enhanced HTTP error surfaces (status + response text).

- `apps/health-mobile/app/_layout.tsx`
  - Added push token registration on authenticated startup.
  - Wrapped root with `GestureHandlerRootView` for bottom sheet compatibility.

- `apps/health-mobile/package.json`
- `apps/health-mobile/package-lock.json`
  - Installed dependencies:
    - `expo-camera@~15.0.16`
    - `expo-image-picker@~15.0.7`
    - `expo-notifications@^0.28.19`
    - `@gorhom/bottom-sheet@^4.6.4`
    - `react-native-svg@^15.15.3`

## Explicit Overwrite / Rewrite Decisions
- `src/lib/health/pdf.ts`: left unchanged intentionally (spec required "already written; do not modify").
- `src/app/api/health/chat/route.ts`: left unchanged intentionally (already non-streaming Phase 5-compatible).
- `src/app/api/health/export/summary/route.ts`: left unchanged intentionally (already present and valid).
- Stub tab files (`upload.tsx`, `timeline.tsx`, `chat.tsx`) were fully rewritten to Phase 5 implementations.
- Mobile API and layout were updated in place rather than replaced wholesale.

## Compatibility Decisions Made During Implementation
- Kept existing upload contracts already used in repo:
  - `presignUpload` uses `fileSizeBytes` (not `sizeBytes`).
  - `confirmUpload` returns `snapshotId` (not `id`).
- OCR route updates the referenced placeholder snapshot (from confirm step) instead of creating an extra duplicate row.
- Digest cron supports `GET` and `POST` handlers for operational flexibility while still being secret-protected.

## Validation Run

### Passed
- `npm test -- src/__tests__/health/snapshots.test.ts`
  - Result: 14/14 tests passed.

### Blocked by pre-existing repository issues (not introduced by this Phase 5 work)
- `npm run build` (root `chorum_v2`)
  - Fails on pre-existing duplicate declaration in `src/db/schema.ts` (`mobileAuthCodes` declared twice).
- `npx tsc --noEmit` (root)
  - Fails on multiple pre-existing strict-typing issues across existing test and health files.
- `npx tsc --noEmit` (`apps/health-mobile`)
  - Fails on pre-existing type issues in `components/HealthCharts.tsx` unrelated to new Phase 5 files.

## Final State
Phase 5 feature code is implemented and documented, with backend + mobile deliverables added.
Repository-wide type/build health still has unrelated pre-existing blockers that should be resolved before production deployment.
