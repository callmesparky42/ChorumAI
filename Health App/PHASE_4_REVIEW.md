# Phase 4 Review

**Date:** 2026-03-06
**Reviewer:** Claude (claude-sonnet-4-6)
**Scope:** Health Phase 4 (`HEALTH_PHASE_4_SPEC.md`) — pass/fail against spec
**Verdict:** CONDITIONAL PASS — 2 build blockers, 1 migration pending, rest is clean

---

## Deliverable Checklist

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 1 | `src/lib/nebula/types.ts` — add `read:health`, `write:health` | PASS | Both scopes present in `TokenScope` |
| 2 | `src/app/api/auth/mobile-init/route.ts` | PASS | Redirects to Google via NextAuth; correct |
| 3 | `src/app/api/auth/mobile-callback/route.ts` | PASS | Code-exchange pattern; token never in deep-link URL |
| 4 | `src/app/api/auth/mobile-exchange/route.ts` | PASS | One-time code → token swap; used-flag enforced |
| 5 | `src/app/api/auth/mobile-token/route.ts` | PASS | DELETE; validates ownership before revoke |
| 6 | `src/db/schema.ts` — `mobileAuthCodes` table | **FAIL** | Table NOT in schema.ts — see Issue 2 |
| 7 | `drizzle/0015_mobile_auth_codes.sql` | PASS (unapplied) | File present; needs Supabase apply — see Issue 3 |
| 8 | `apps/health-mobile/package.json` | PASS | Local file dep for health-types (correct) |
| 9 | `apps/health-mobile/app.json` | PASS | scheme: chorum; Health Connect plugin |
| 10 | `apps/health-mobile/lib/api.ts` | PASS | All health endpoints; SecureStore token management |
| 11 | `apps/health-mobile/lib/auth.ts` | PASS | Code-exchange flow; biometric re-auth; no raw token in deep-link |
| 12 | `apps/health-mobile/lib/health-connect.ts` | PASS | Permission request; daily read; 7-day sync loop |
| 13 | `apps/health-mobile/app/_layout.tsx` | PASS | Auth gate + deep-link handler |
| 14 | `apps/health-mobile/app/login.tsx` | PASS | Sign-in screen |
| 15 | `apps/health-mobile/app/(tabs)/*` | PASS | Dashboard + stub tabs present |
| 16 | `apps/health-mobile/components/VitalsCards.tsx` | PASS | 4-card layout |
| 17 | `apps/health-mobile/components/HealthCharts.tsx` | PASS | HR area + sleep bar charts |
| 18 | `packages/health-types/src/index.ts` — type updates | PASS | See Accepted Deviations |
| 19 | `src/app/api/health/chat/stream/route.ts` | **FAIL** | `snapshotCount` destructure — see Issue 1 |

---

## Issues

### Issue 1 — Build Blocker: `snapshotCount` in chat stream route

**File:** `src/app/api/health/chat/stream/route.ts` line 79

```typescript
// Current — fails tsc: 'snapshotCount' does not exist on type 'HealthContextResult'
const { contextBlock, snapshotCount } = await buildHealthContext(auth.userId)
```

`HealthContextResult` exports `dynamicCount` and `staticCount` (added during temporal awareness). `snapshotCount` no longer exists. The variable is also never referenced after this line — it was vestigial from before the temporal refactor and Codex didn't notice the type mismatch.

**Fix:** Remove `snapshotCount` from the destructure.

```typescript
const { contextBlock } = await buildHealthContext(auth.userId)
```

---

### Issue 2 — Build Blocker: `mobileAuthCodes` not in `src/db/schema.ts`

The changelog states `src/db/schema.ts` was updated, but the table definition is absent. Both `mobile-callback` and `mobile-exchange` routes import:

```typescript
import { mobileAuthCodes } from '@/db/schema'
```

This import resolves to `undefined` at runtime and fails TypeScript at build time. The Drizzle schema entry needs to be added.

**Fix:** Add to end of `src/db/schema.ts`:

```typescript
export const mobileAuthCodes = pgTable('mobile_auth_codes', {
  code:      text('code').primaryKey(),
  token:     text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used:      boolean('used').notNull().default(false),
})
```

Requires adding `boolean` to the drizzle-orm import at the top of schema.ts (if not already present).

---

### Issue 3 — Migration Pending: `0015_mobile_auth_codes.sql`

The SQL file exists in `drizzle/`. The `mobile_auth_codes` table does not yet exist in Supabase (core project, not health project — this goes against `DATABASE_URL`, not `HEALTH_DATABASE_URL`).

**Action required:** Apply via MCP or Supabase dashboard against the core project before the auth routes can function at runtime.

---

## Accepted Deviations

### `GarminDailyPayload` restructure

**Spec intent:** Add `activeCalories`, `totalCalories`, `stressAvg`, `bodyBatteryEnd` to match Phase 3 transformer output and Health Connect bridge output.

**Implementation:** Old canonical fields `activeMinutes`, `calories`, `stressLevel` demoted to optional backward-compat aliases. New fields promoted to required. `GarminHRVPayload.hrvStatus` relaxed from a literal union to `string | null` — matches what the transformer actually produces.

**Impact check:** Grep across `src/` finds zero references to the demoted field names — no breakage in web layer. Mobile app (`health-connect.ts`) writes the new field names. Accept.

### `@chorum/health-types` as local file dep in mobile

Spec assumed `@chorum/health-types@*` would resolve via npm. Registry returns 404 (package not published). Local file dependency `"file:../../packages/health-types"` is the correct workaround for a monorepo. Accept.

### `apps/**` excluded from root `tsconfig.json`

Prevents Next.js build from attempting to type-check Expo's React Native code with web aliases. Correct decision. Accept.

---

## Required Fixes Before Phase 5

1. **Fix `snapshotCount` in `src/app/api/health/chat/stream/route.ts`** — one-line removal
2. **Add `mobileAuthCodes` to `src/db/schema.ts`** — 6-line table definition
3. **Apply `0015_mobile_auth_codes.sql` to core Supabase project** — human action

Issues 1 and 2 are mechanical. I can apply both immediately.
