# Phase 2 Review Report

**Date:** 2026-02-23  
**Reviewer:** Antigravity (Gemini 2.5 Pro) — via REVIEWSKILL  
**Phase:** Phase 2 — Binary Star Core (Layer 1)  
**Commit/State:** Post-implementation — `[2.0.0-alpha.2]` per CHANGELOG.md  

---

## Section 1: Spec Compliance Audit

### 1.1 Deliverable Inventory

| Deliverable | Spec Location | Implementation Location | Status |
|---|---|---|---|
| `podium/index.ts` — PodiumInterface export | Phase Architecture §2a | `src/lib/core/podium/index.ts` | ✅ |
| `podium/scorer.ts` — scoring formula + type weights | Phase Architecture §2a | `src/lib/core/podium/scorer.ts` | ✅ |
| `podium/tiers.ts` — tier selection + budget clamping | Phase Architecture §2a | `src/lib/core/podium/tiers.ts` | ✅ |
| `podium/compiler.ts` — context string assembly | Phase Architecture §2a | `src/lib/core/podium/compiler.ts` | ✅ |
| `podium/audit.ts` — InjectionAuditEntry log | Phase Architecture §2a | Merged into `podium/podium.ts` (no separate `audit.ts`) | ⚠️ |
| `podium/cache.ts` — Tier 1/2 pre-compiled cache | Phase Architecture §2a | `src/lib/core/podium/cache.ts` | ✅ |
| `conductor/index.ts` — ConductorInterface export | Phase Architecture §2b | `src/lib/core/conductor/index.ts` | ✅ |
| `conductor/signals.ts` — signal ingestion + routing | Phase Architecture §2b | `src/lib/core/conductor/signals.ts` | ✅ |
| `conductor/heuristics.ts` — turn-pattern analysis | Phase Architecture §2b | `src/lib/core/conductor/heuristics.ts` | ✅ |
| `conductor/confidence.ts` — formula + floor/ceiling | Phase Architecture §2b | `src/lib/core/conductor/confidence.ts` | ✅ |
| `conductor/decay.ts` — computeDecayedConfidence() | Phase Architecture §2b | `src/lib/core/conductor/decay.ts` | ✅ |
| `conductor/proposals.ts` — proposal creation + inbox | Phase Architecture §2b | `src/lib/core/conductor/proposals.ts` | ✅ |
| `conductor/guardrails.ts` — invariant enforcement | Phase Architecture §2b | `src/lib/core/conductor/guardrails.ts` | ✅ |
| `conductor/queue.ts` — DB-backed queue + zombie recovery | Phase Architecture §2b | `src/lib/core/conductor/queue.ts` | ✅ |
| `conductor/judge.ts` — end-of-session LLM judge stub | Phase Architecture §2b | `src/lib/core/conductor/judge.ts` | ✅ |
| `conductor_queue` schema + migration | Phase Architecture §2b | Migration `0002_user_settings.sql` (partial; see §1.2) | ⚠️ |
| `conductor_proposals` schema + migration | Phase Architecture §2b | Present in schema (Phase 1 migration) | ✅ |
| Cron route `/api/cron/decay` | Phase Architecture §Phase 1 decay | Present per CHANGELOG | ✅ |
| Cron route `/api/cron/zombie-recovery` | Phase Architecture §2b | Present per CHANGELOG | ✅ |
| `BinaryStarInterface` unified export | Inferred from arch | `src/lib/core/interface.ts` + `impl.ts` | ✅ |

**Legend:** ✅ Implemented and matches spec | ❌ Missing | ⚠️ Implemented but deviates from spec

### 1.2 Deviation Analysis

---

**Deliverable:** `podium/audit.ts`  
**Expected (from spec):** Separate file `audit.ts` exporting `InjectionAuditEntry` log builder  
**Actual (in code):** Audit entry construction is inlined in `podium/podium.ts`; there is no separate `audit.ts` file  
**Severity:** Minor  
**Recommendation:** Acceptable deviation — audit logic is correctly present and called on every injection  
**Justification:** The spec listed `audit.ts` as a file boundary for clarity, not as a mandatory module boundary. Audit trail behavior is fully implemented inline; no contract is violated.

---

**Deliverable:** Migration naming — `conductor_queue` / `conductor_proposals` tables  
**Expected (from spec):** A dedicated Phase 2 migration containing `conductor_queue` and `conductor_proposals` tables  
**Actual (in code):** `CHANGELOG` records `0002_user_settings.sql` — suggests these tables may have been folded into Phase 1 schema (migration 0001) rather than a Phase 2 dedicated migration  
**Severity:** Minor  
**Recommendation:** Verify that `conductor_queue` and `conductor_proposals` tables do exist in the deployed schema with all correct columns. If they were included in `0001`, it's an organizational deviation, not a functional one.  
**Justification:** Functionally harmless if tables exist. Migration naming convention `NNNN_snake_case.sql` (CHECKLIST Gate 4) may be violated if the tables aren't in a Phase 2 migration.

---

**Deliverable:** Muted item exclusion in Podium selection loop  
**Expected (from spec):** "Podium never injects if non-null [muted_at]" — `CHORUM_V2_PHASE_ARCHITECTURE.md` §learnings schema  
**Actual (in code):** `podium.ts` does not filter on `muting_at` before the scored-candidate selection pass. Pinned items get explicit handling; muted items do not.  
**Severity:** Major  
**Recommendation:** Fix code — add `filter(c => c.mutedAt === null)` before scoring loop in `podium.ts`, consistent with the pinned item deduplication already present  
**Justification:** This is a contract invariant, not a policy decision. Injecting muted items breaks the user trust contract.

---

**Deliverable:** `voice` type half-life in `decay.ts`  
**Expected (from spec):** Architecture spec does not list `voice` in `HALF_LIFE_DAYS` — implying no decay (immortal like `character`)  
**Actual (in code):** `decay.ts` assigns `voice: 90` (half-life 90 days)  
**Severity:** Minor — but inconsistency between spec and implementation  
**Recommendation:** Update spec `PODIUM_INTERFACE_SPEC.md` / `CHORUM_V2_PHASE_ARCHITECTURE.md` to either confirm `voice: 90` was an intentional decision (the coding is reasonable), or revert to immortal  
**Justification:** `voice` is a creative writing type alongside `character` and `world_rule`. The spec's decay table omits `voice` entirely, but the code treats it like `pattern`. Spec should be updated to reflect the decision, whichever direction.

---

**Deliverable:** `plot_thread` half-life  
**Expected (from spec):** `plot_thread: 90` listed in Architecture §decay table  
**Actual (in code):** `plot_thread: 90` — matches  
**Severity:** ✅ No deviation

---

**Deliverable:** Singleton pattern in `impl.ts`  
**Expected (from spec):** No singleton requirement specified  
**Actual (in code):** `createBinaryStar()` returns a module-level singleton (`let _binaryStar`)  
**Severity:** Minor — potential concern for test isolation and multi-tenant edge cases  
**Recommendation:** Document as an intentional Phase 2 decision; ensure Phase 3 tests reset the singleton or the factory accepts a nebula argument that sidesteps the cache  
**Justification:** In a serverless Next.js environment, module-level singletons survive only within a single cold start. The risk is low but should be explicitly acknowledged.

---

## Section 2: Interface Contract Verification

### 2.1 Interface Match

| Interface | Spec Definition | Code Definition | Match |
|---|---|---|---|
| `PodiumRequest` | Architecture §2a | `src/lib/core/interface.ts:L30-39` | ✅ |
| `PodiumResult` | Architecture §2a | `src/lib/core/interface.ts:L50-62` | ⚠️ field renamed |
| `InjectedLearning` | Architecture §2a | `src/lib/core/interface.ts:L41-48` | ✅ |
| `ConductorSignal` | Architecture §2b | `src/lib/core/interface.ts:L70-78` | ✅ |
| `ConductorProposal` | Architecture §2b | `src/lib/core/interface.ts:L82-91` | ✅ |
| `BinaryStarInterface` | Architecture §2b | `src/lib/core/interface.ts:L97-106` | ✅ |
| `DomainSignal` | Architecture §2b | `src/lib/core/interface.ts:L22-28` | ✅ |

### 2.2 Interface Discrepancies

**Interface:** `PodiumResult`  
**Spec version:**
```typescript
interface PodiumResult {
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  compiledContext: string
  auditLog: InjectionAuditEntry[]   // ← spec name
}
```

**Code version:**
```typescript
interface PodiumResult {
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  compiledContext: string
  auditEntries: {                   // ← code name
    learningId: string | null
    included: boolean
    score: number
    reason: string | null
    excludeReason: string | null
  }[]
}
```

**Differences:**
- Field name: spec says `auditLog`, code uses `auditEntries`
- `InjectionAuditEntry` type is inline in `PodiumResult` rather than a named export

**Resolution:** Update spec — `auditEntries` is a clearer name. The in-line type is acceptable but a named `AuditEntry` export would aid readability. Document as intentional.

---

## Section 3: Layer Boundary Audit

### 3.1 Import Direction Analysis

| File | Layer | Imports From | Violation? |
|---|---|---|---|
| `src/lib/core/podium/podium.ts` | 1 | `@/lib/nebula` (Layer 0), `./tiers`, `./scorer`, `./compiler`, `./cache` | ✅ None |
| `src/lib/core/podium/scorer.ts` | 1 | `@/lib/nebula` (types only) | ✅ None |
| `src/lib/core/podium/tiers.ts` | 1 | No imports from other lib layers | ✅ None |
| `src/lib/core/conductor/signals.ts` | 1 | `@/lib/nebula` (Layer 0), `../interface`, `./confidence`, `./proposals`, `./guardrails` | ✅ None |
| `src/lib/core/conductor/decay.ts` | 1 | `@/lib/nebula/types` (types only) | ✅ None |
| `src/lib/core/conductor/queue.ts` | 1 | `@/db` (direct Drizzle import) | ⚠️ See below |
| `src/lib/core/conductor/guardrails.ts` | 1 | `@/lib/nebula` (NebulaError) | ✅ None |
| `src/lib/core/impl.ts` | 1 | `@/lib/nebula`, `./interface`, `./podium`, `./conductor` | ✅ None |
| `src/lib/core/interface.ts` | 1 | `@/lib/nebula/types` (ScopeFilter) | ✅ None |

### 3.2 Violations Found

**File:** `src/lib/core/conductor/queue.ts`  
**Layer:** 1 (Binary Star / Core)  
**Concern:** Imports `@/db` and `conductorQueue` from `@/db/schema` directly — bypassing the `NebulaInterface` abstraction  
**Assessment:** This is a design judgment call. The queue table (`conductor_queue`) is a Conductor-specific concern that doesn't logically belong in Layer 0's `NebulaInterface`. A direct DB import here is pragmatic and mirrors how the Conductor's proposals are stored. However, it means `queue.ts` cannot be tested without a live DB connection.  
**Recommendation:** Acceptable for Phase 2. In Phase 3+, consider wrapping queue operations behind a `ConductorStorageInterface` to enable unit testing. Not a blocking violation.

---

## Section 4: Guardian Skill Results

### 4.1 Guardian Skill Execution

| Skill | Applicable | Result | Issues |
|---|---|---|---|
| `chorum-layer-guardian` | ✅ | CONDITIONAL PASS | 1 concern (queue.ts direct DB import) |
| `nebula-schema-guardian` | Phase 1 gate | N/A for Phase 2 review | — |
| `podium-injection-agent` | ✅ | CONDITIONAL PASS | Muted item exclusion missing (Major) |
| `conductor-spec-agent` | ✅ | PASS | No blocking issues |
| `mcp-contract-agent` | Phase 3 gate | N/A | — |

### 4.2 Guardian Failures

**Skill:** `podium-injection-agent`  
**Check Failed:** Muted item injection guard  
**Evidence:** `podium.ts` selection loop does not filter `mutedAt !== null` before scoring. Pinned items are filtered; muted items are not.  
**Required Fix:** Add muted-item filter in `podium.ts` before the scoring/selection pass:
```typescript
const candidates = rawCandidates.filter(c => c.mutedAt === null)
```

---

## Section 5: Design Principles Compliance

### 5.1 Principle Compliance Matrix

| # | Principle | Compliance | Evidence |
|---|---|---|---|
| 1 | The Graph is the Product | ✅ | All Podium/Conductor decisions write to `injection_audit`; graph is the state store |
| 2 | Binary Star Core | ✅ | `impl.ts` wires Podium + Conductor as a single unit; they share only NebulaInterface |
| 3 | Capture Surfaces are Disposable | ✅ | Phase 2 is entirely headless; no UI logic present |
| 4 | Layers Have Contracts | ✅ | `BinaryStarInterface` is the single export; no direct inner-layer imports from outer layers confirmed |
| 5 | Token Economy is First-Class | ✅ | Tier budgets, `computeEffectiveBudget()`, attention density sorting, and budget clamping all implemented |
| 6 | Learning is Near-Real-Time | ✅ | `incrementUsageCount` is fire-and-forget; zombie recovery runs on 5-min cron |
| 7 | Domain Awareness is Structural | ✅ | `TYPE_WEIGHTS_BY_DOMAIN` in scorer.ts; 4 domain profiles (coding/writing/trading/research) with intent-adaptive profiles |
| 8 | Sovereignty by Default | ✅ | End-of-session judge is `disabled by default`; no cloud calls in hot path |
| 9 | Self-Improvement Has Guardrails | ✅ | `assertNoDelete`, pinned check, unverified cap (0.7), large-delta proposal routing — all enforced |
| 10 | The System Explains Itself | ⚠️ | Audit trail populated for all decisions (included AND excluded) ✅ — but muted items are not audit-logged as excluded (same root cause as §1.2) |

### 5.2 Principle Violations

**Principle:** The System Explains Itself (Principle 10)  
**Violation:** Muted items are silently not-fetched and not audit-logged as excluded  
**Location:** `podium/podium.ts` — candidate fetch and selection loop  
**Impact:** Audit trail is incomplete; user cannot verify that muted items were correctly suppressed  
**Remediation:** Filter muted items before scoring AND log each muted item as an excluded audit entry with `excludeReason: 'muted'`

---

## Section 6: Build & Type Safety

### 6.1 Build Status

| Check | Result | Notes |
|---|---|---|
| `npx next build` | PASS (inferred) | CHANGELOG records no build failures; `tsc_output.txt` exists with no errors recorded |
| TypeScript strict | PASS | Per CHECKLIST Gate 3 — no `@ts-ignore` or untyped `any` visible in reviewed files |
| `@ts-ignore` count | 0 (in reviewed files) | Not audited exhaustively across all files |
| `any` type count | 0 (in reviewed files) | Types are correctly scoped throughout reviewed files |
| ESLint | RUNNING | A long-running eslint command against `src/lib/nebula` is active (15h+) — result unknown |

### 6.2 Type Safety Issues

| File | Line | Issue | Justification Required |
|---|---|---|---|
| `src/lib/core/podium/podium.ts` | L44 | `as 384 \| 1536` cast | Acceptable — dimension inferred from vector length; comment explains rationale |
| `src/lib/core/conductor/queue.ts` | L19 | `typeof conductorQueue.$inferSelect` return type | Drizzle inferred type — acceptable for schema-bound operations |

> **Note:** The ESLint process running against `src/lib/nebula` has been active for 15+ hours. This should be investigated — it may indicate an ESLint config loop, infinite resolution, or a hung process. **Action required: terminate and re-run ESLint with a timeout.**

---

## Section 7: Test Coverage

### 7.1 Test Inventory

| Component | Test File | Happy Path | Edge Cases | Invariant Tests |
|---|---|---|---|---|
| Podium scoring | None found | ❌ | ❌ | ❌ |
| Podium tier/budget | None found | ❌ | ❌ | ❌ |
| Conductor guardrails | None found | ❌ | ❌ | ❌ |
| Conductor decay | None found | ❌ | ❌ | ❌ |
| Signal routing | None found | ❌ | ❌ | ❌ |
| Zombie recovery | None found | ❌ | ❌ | ❌ |

### 7.2 Missing Critical Tests

| Component | Missing Test | Risk |
|---|---|---|
| `scorer.ts` | `scoreCandidate()` output values for each intent profile | Wrong weights silently ship; scoring drift undetectable |
| `tiers.ts` | Budget clamping at each tier boundary (16K, 64K) | Spec v1 bug repeats — over-injection without test |
| `guardrails.ts` | Pinned item rejection; unverified cap enforcement | Guardrails are useless without negative tests |
| `decay.ts` | `computeDecayedConfidence()` for pinned/immortal/decaying types | Confidence drift bug is silent without a test |
| `signals.ts` | Heuristic/inaction signals do NOT mutate confidence_base | No test verifying the v2.0 store-only policy |
| `queue.ts` | `recoverZombies()` with locked > 10 min items | Zombie recovery may silently fail on real data |

**CHECKLIST Gate 6 verdict:** ❌ FAILS — No tests exist for any Phase 2 component. This is the most significant gap relative to the inter-phase protocol.

---

## Section 8: Documentation Sync

### 8.1 Documentation Status

| Document | Last Updated | Matches Code | Needs Update |
|---|---|---|---|
| `CHANGELOG.md` | Phase 2 entry present | ✅ | `auditLog` → `auditEntries` rename not noted |
| `CHORUM_V2_PHASE_ARCHITECTURE.md` | Pre-Phase 2 | ⚠️ | Voice half-life omission; `audit.ts` file not created; `auditLog` → `auditEntries` |
| `PHASE_2_SPEC.md` | Exists | Not fully audited | Needs cross-check against `auditEntries` change |
| README.md | Not audited | — | Likely aspirational |

### 8.2 Spec Drift

| Spec | Section | Code Reality | Spec Claims |
|---|---|---|---|
| `CHORUM_V2_PHASE_ARCHITECTURE.md` | §2a Files | `audit.ts` does not exist | Lists `audit.ts` as a file |
| `CHORUM_V2_PHASE_ARCHITECTURE.md` | §2a `PodiumResult` | Field is `auditEntries` | Field is `auditLog` |
| `CHORUM_V2_PHASE_ARCHITECTURE.md` | §decay table | `voice` absent from table | Code adds `voice: 90` half-life |
| `CHORUM_V2_PHASE_ARCHITECTURE.md` | §learnings | Muted items excluded at injection | Not enforced in Podium loop |

---

## Section 9: Debt Assessment

### 9.1 Technical Debt Inventory

| Item | Location | Type | Severity | Defer OK? |
|---|---|---|---|---|
| Muted item exclusion missing | `podium/podium.ts` | Bug / Contract violation | High | No |
| No tests for any Phase 2 component | `src/lib/core/**` | Missing test baseline | High | No (blocks Phase 3 confidence) |
| `voice` half-life unspecified in spec | `conductor/decay.ts` / Architecture doc | Spec drift | Low | Yes — update spec |
| `auditLog` → `auditEntries` rename undocumented | `core/interface.ts` + CHANGELOG | Spec drift | Low | Yes — update spec |
| Singleton pattern in `impl.ts` | `core/impl.ts` | Architectural risk | Low | Yes — document in Phase 3 |
| ESLint process hung (15h+) | CI environment | Infrastructure | Medium | Short-term yes; must resolve before merge |
| `queue.ts` bypasses NebulaInterface | `conductor/queue.ts` | Layer abstraction gap | Low | Yes — Phase 3 refactor |
| Per-item scope tag lookup deferred | `podium/podium.ts:L61-64` | Phase 2 known stub | Low | Yes — Phase 3 |

### 9.2 TODO/FIXME/HACK Audit

| File | Line | Marker | Content | Phase to Address |
|---|---|---|---|---|
| `podium/podium.ts` | L61-64 | Comment | Per-item scope tag lookup deferred to Phase 3 | Phase 3 |

### 9.3 Debt Verdict

**Total debt items:** 8  
**Critical (must fix before next phase):** 2 (muted exclusion bug, zero test coverage)  
**Acceptable (can defer):** 6  
**Recommendation:** **PAUSE AND FIX** on the two critical items before starting Phase 3

---

## Section 10: Phase Completion Verdict

### Summary Scores

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Spec Compliance | 80 | 25% | 20.0 |
| Interface Contracts | 85 | 20% | 17.0 |
| Layer Boundaries | 90 | 20% | 18.0 |
| Guardian Skills | 70 | 15% | 10.5 |
| Design Principles | 88 | 10% | 8.8 |
| Build / Type Safety | 80 | 5% | 4.0 |
| Test Coverage | 0 | 5% | 0.0 |
| **TOTAL** | | 100% | **78.3** |

### Verdict

**Phase 2 Status:** ⚠️ CONDITIONAL

Score 78.3 — above the CONDITIONAL threshold (75–89). Proceed to Phase 3 **only after resolving the two blocking issues below.**

---

### Blocking Issues (must resolve before Phase 3)

1. **Muted item injection guard missing** — `podium/podium.ts` does not filter `mutedAt !== null` before the scoring loop. Items the user has explicitly muted can be injected. This violates the schema invariant and Principle 10 (auditability). **Fix: add muted filter + audit log entry before scoring.**

2. **Zero test coverage for Phase 2** — No test files exist for any Podium or Conductor component. CHECKLIST Gate 6 requires at least one happy-path test per core function and negative tests for guardrails. **Fix: write tests for `scoreCandidate`, `computeEffectiveBudget`, `checkGuardrails` (pinned + unverified cap), `computeDecayedConfidence`, and `recoverZombies`.**

---

### Conditional Items (should resolve, can defer with documented risk)

1. **`voice` type half-life undocumented in spec** — `decay.ts` assigns `voice: 90` days but Architecture doc omits `voice` from the decay table. Risk: spec and code silently diverge; future LLM pass may reset to immortal. Fix: update Architecture doc to reflect `voice: 90`.

2. **`auditLog` → `auditEntries` rename** — Interface spec uses `auditLog` but code exports `auditEntries`. Risk: Phase 3/5 callers built from spec will have a naming mismatch. Fix: update CHANGELOG entry and Architecture doc to use `auditEntries`.

3. **ESLint process hung (15h+)** — An eslint process targeting `src/lib/nebula` has been running for over 15 hours. Risk: CI is effectively blocked on this process; lint results are unknown. Fix: terminate the process, investigate config, re-run with a timeout.

4. **Singleton pattern in `BinaryStarImpl`** — The module-level `_binaryStar` singleton in `impl.ts` is not specified. Risk: test isolation issues in Phase 3+. Fix: document as intentional or refactor factory.

---

### Recommendations

1. **Fix the muted item bug immediately** — it's a 3-line change in `podium.ts` and a critical contract violation
2. **Write Phase 2 tests before opening Phase 3 work** — minimum viable test suite: `scorer.test.ts`, `tiers.test.ts`, `guardrails.test.ts`, `decay.test.ts`
3. **Backport `auditEntries` rename to the Architecture doc** — keep as the canonical spec name with a note explaining why `auditLog` was changed
4. **Terminate the hung ESLint process** — 15 hours is not a normal run; investigate before starting Phase 3 cron work
5. **Add a Phase 3 ticket for queue abstraction** — `conductor/queue.ts` bypassing `NebulaInterface` is acceptable now but will limit testability

---

### Sign-off

- [ ] Muted item exclusion bug fixed in `podium/podium.ts`
- [ ] Minimum viable Phase 2 test suite written and passing
- [ ] `auditEntries` rename backported to Architecture doc
- [ ] ESLint process investigated and resolved
- [ ] Human review completed (run the decay cron and confirm `confidence` column updates)
- [ ] CHANGELOG updated with any fixes
- [ ] Ready for Phase 3
