# Phase 5 Review Report

**Date:** 2026-02-27
**Reviewer:** Antigravity (Gemini 2.5 Pro)
**Phase:** Phase 5 — Shell Layer (Layer 4)
**State:** Post-implementation, first run. `npm run dev` was failing on startup.

---

## Section 1: Spec Compliance Audit

### 1.1 Deliverable Inventory

| Deliverable | Spec Location | Implementation Location | Status |
|-------------|---------------|------------------------|--------|
| `globals.css` — Hygge Brutalist tokens | Step 1 | `src/app/globals.css` | ✅ |
| `HyggeButton.tsx` | Step 2.1 | `src/components/hygge/HyggeButton.tsx` | ✅ |
| `HyggeCard.tsx` | Step 2.2 | `src/components/hygge/HyggeCard.tsx` | ✅ |
| `HyggeToggle.tsx` | Step 2.3 | `src/components/hygge/HyggeToggle.tsx` | ✅ |
| `HyggeInput.tsx` | Step 2.4 | `src/components/hygge/HyggeInput.tsx` | ✅ |
| `HyggeTabs.tsx` | Step 2.5 | `src/components/hygge/HyggeTabs.tsx` | ✅ |
| `HyggeModal.tsx` | Step 2.6 | `src/components/hygge/HyggeModal.tsx` | ✅ |
| `HyggeToast.tsx` | Addendum A10 | `src/components/hygge/HyggeToast.tsx` | ✅ |
| `hygge/index.ts` | Step 2.7 | `src/components/hygge/index.ts` | ✅ |
| Shell Layout + auth gate | Step 3 | `src/app/(shell)/layout.tsx` | ⚠️ |
| `ShellSidebar.tsx` + inbox badge | Step 3.1, A8 | `src/components/shell/ShellSidebar.tsx` | ✅ |
| `CommandPalette.tsx` (Cmd+K) | Addendum A2 | `src/components/shell/CommandPalette.tsx` | ✅ |
| `KeyboardShortcuts.tsx` | Addendum A3 | `src/components/shell/KeyboardShortcuts.tsx` | ✅ |
| `ChatHistory.tsx` | Addendum A4 | `src/components/shell/ChatHistory.tsx` | ✅ |
| Chat page with context injection display | Step 4 | `src/app/(shell)/chat/page.tsx` | ⚠️ |
| `useChat` hook with persistence | Step 4, A4 | `src/lib/shell/hooks.ts` | ✅ |
| Settings page — 4 tabs | Step 5 | `src/app/(shell)/settings/page.tsx` | ⚠️ |
| Conductor Inbox page | Step 6 | `src/app/(shell)/inbox/page.tsx` | ✅ |
| Knowledge gateway + empty state + templates | Step 7, A1 | `src/app/(shell)/knowledge/page.tsx` | ⚠️ |
| Injection Audit Viewer | Step 8 | `src/app/(shell)/audit/page.tsx` | ⚠️ |
| Server Actions `actions.ts` | Step 9 | `src/lib/shell/actions.ts` | ⚠️ |
| Root layout update | Step 10 | `src/app/layout.tsx` | ✅ |
| Template JSON files (react-nextjs, python, creative-writing) | Addendum A1 | MISSING | ❌ |

### 1.2 Deviation Analysis

**Deliverable:** Shell Layout — `getPendingProposalCount` crash  
**Expected:** Layout loads, inbox count shown (0 if no proposals)  
**Actual:** `ECONNREFUSED` DB error crashed the entire layout on startup (the root error in the user report)  
**Severity:** Critical — blocked `npm run dev` entirely  
**Fix applied:** Wrapped call in `.catch(() => 0)` — gracefully returns 0 on DB failure  

---

**Deliverable:** Settings page userId  
**Expected:** userId from session/auth context  
**Actual:** Hardcoded `userId = 'user-1'` — all provider/persona queries would fail silently  
**Severity:** Critical — settings CRUD would hit wrong user's data  
**Fix applied:** Replaced with `getCurrentUserId()` server action call  

---

**Deliverable:** Chat feedback — per-learning feedback with visual state  
**Expected (Addendum A10):** 👍👎 in context panel tied to specific learning IDs, visual pressed state, actual `submitFeedback` call  
**Actual:** `handleFeedback` was a stub — only showed toast, never called `submitFeedback`, no visual state  
**Severity:** Major — feedback signal is Chorum's core learning loop; stub = no learning  
**Fix applied:** Wired through to `submitFeedback()` from hook, added `ratedItems` state for visual pressed state  

---

**Deliverable:** Knowledge template import  
**Expected (Addendum A1):** `importTemplate()` calls a Server Action that reads static template JSON and calls `ChorumClient.injectLearning()` for each item  
**Actual:** `fetch('/api/templates/${templateName}')` — calls a non-existent API route, shows "(Simulated)" toast  
**Severity:** Major — broken UX, template import is non-functional  
**Recommendation:** Implement Server Action `importTemplate(name: string)` that reads template JSON from `src/lib/shell/templates/` and loops `addLearning()`  
**Template JSON files:** Also missing entirely from repository  

---

**Deliverable:** Injection Audit Viewer  
**Expected (Step 8):** Real injection audit data from `injection_audit` table — per-learning scores, semantic/recency/confidence breakdown, actual feedback submitted  
**Actual:** Shows conversation history list with hardcoded mock strings ("Provider: auto", "Tokens: ~1200", "No detailed audit data available")  
**Severity:** Major — the "why did Chorum show me this?" transparency is the entire point of the audit page  
**Recommendation:** Implement `getInjectionAudit` Server Action querying `injection_audit` table joined with `learnings`  

---

## Section 2: Interface Contract Verification

### 2.1 Interface Match

| Interface | Spec | Code | Match |
|-----------|------|------|-------|
| `useChat` return shape | Step 4 | `hooks.ts:114-129` | ✅ Exceeds spec (adds `resultMeta`, `rawContext`, `injectedContext`) |
| `ChatMessage` | Step 4 | `hooks.ts:15` | ✅ |
| `ConversationSummary` | Addendum A4 | `hooks.ts:16` | ✅ |
| injectedContext items | Addendum A10 | `hooks.ts:90-100` | ⚠️ |

### 2.2 Interface Discrepancies

**Interface:** injectedContext item shape  
**Expected:** `{ id: string, type: string, content: string }` — `id` required for `submitFeedback(learningId, signal)`  
**Actual:** `{ type: string, content: string, rest: string }` — parsed from the injectedContext string, no `id` extracted  
**Impact:** `handleFeedback` checks `if (item.id)` — will always be falsy, so feedback is never actually submitted to the DB even after the stub fix  
**Resolution:** `AgentChatResult.injectedContext` needs to include structured items with IDs, or the context string format must embed IDs. This is an interface gap between Layer 3 (AgentInterface) output and Shell consumption.

---

## Section 3: Layer Boundary Audit

### 3.1 Import Direction Analysis

| File | Layer | Imports From | Violation? |
|------|-------|--------------|------------|
| `src/app/(shell)/layout.tsx` | 4 | `@/lib/shell/actions` (Shell) | ✅ Valid |
| `src/app/(shell)/chat/page.tsx` | 4 | `@/lib/shell/hooks`, `@/components/hygge` | ✅ Valid |
| `src/app/(shell)/inbox/page.tsx` | 4 | `@/lib/shell/actions` | ✅ Valid |
| `src/app/(shell)/knowledge/page.tsx` | 4 | `@/lib/shell/actions` | ✅ Valid |
| `src/app/(shell)/settings/page.tsx` | 4 | `@/lib/shell/actions` | ✅ Valid |
| `src/app/(shell)/audit/page.tsx` | 4 | `@/lib/shell/actions` | ✅ Valid |
| `src/lib/shell/actions.ts` | 4 | `@/db`, `drizzle-orm` | ⚠️ Documented exception |
| `src/lib/shell/actions.ts` | 4 | `@/lib/providers` (`callProvider`) | ⚠️ Documented exception |
| `src/lib/shell/actions.ts` | 4 | `@/lib/core` (`createBinaryStar`) | ⚠️ Documented exception |
| `src/lib/shell/actions.ts` | 4 | `@/lib/nebula` (`createNebula`) | ⚠️ Documented exception |
| `src/lib/shell/hooks.ts` | 4 | `@/lib/agents/types` | ⚠️ Type import only |

### 3.2 Violations Found

**File:** `src/lib/shell/actions.ts`  
**Layer:** 4 (Shell)  
**Invalid Import:** `@/db`, `drizzle-orm` (direct schema access)  
**Target Layer:** 0  
**Rule:** Shell must not access DB directly  
**Context:** Used for `getConversationHistory`, `getConversationMessages`, `saveConversationMessages` because `ChorumClient` has no conversation persistence API surface  
**Assessment:** Acceptable pragmatic exception given the gap in Layer 2 API coverage. Matches the pattern of the `createBinaryStar` inbox exception already documented in the spec. **Must be documented in guardian exceptions.**  

**File:** `src/lib/shell/actions.ts`  
**Layer:** 4 (Shell)  
**Invalid Import:** `@/lib/providers.callProvider`  
**Target Layer:** 3 (Providers)  
**Rule:** Shell server actions may not import directly from Layer 3 implementation files  
**Context:** Used only for `testProviderConnection`  
**Assessment:** Documented in PHASE_5_SPEC.md addendum A7. Acceptable.  

**File:** `src/lib/shell/hooks.ts`  
**Layer:** 4 (Shell)  
**Import:** `AgentChatResult` type from `@/lib/agents/types`  
**Assessment:** Type-only import. Not a runtime dependency. Acceptable.  

---

## Section 4: Guardian Skill Results

### 4.1 Guardian Skill Execution

| Skill | Applicable | Result | Issues |
|-------|------------|--------|--------|
| chorum-layer-guardian | ✅ | CONDITIONAL PASS | 4 documented exceptions in actions.ts |
| nebula-schema-guardian | N/A | — | Phase 0 concern only |
| podium-injection-agent | N/A | — | Phase 2 concern only |
| conductor-spec-agent | N/A | — | Phase 2/3 concern only |
| mcp-contract-agent | N/A | — | Phase 3 concern only |

### 4.2 Guardian Failures

No outright failures. The 4 `actions.ts` import exceptions are all justified and documented in PHASE_5_SPEC.md. The `chorum-layer-guardian` should be updated to know about these exceptions so it doesn't false-positive them in future runs.

---

## Section 5: Design Principles Compliance

### 5.1 Principle Compliance Matrix

| # | Principle | Compliance | Evidence |
|---|-----------|------------|----------|
| 1 | The Graph is the Product | ✅ | Knowledge page is primary, stat view + scope browser |
| 2 | Binary Star Core | ✅ | Inbox exposes ConductorProposals for human review |
| 3 | Capture Surfaces are Disposable | ✅ | Shell is stateless; chat is ephemeral; conversations managed by Layer 2 |
| 4 | Layers Have Contracts | ⚠️ | 4 documented exceptions; injectedContext lacks IDs for feedback loop |
| 5 | Token Economy is First-Class | ⚠️ | `resultMeta.tokensUsed` shown in chat — but no per-injection token breakdown on audit page |
| 6 | Learning is Near-Real-Time | ✅ | `saveConversationMessages` called on each exchange |
| 7 | Domain Awareness is Structural | ✅ | Scope browser, scope tag filter in knowledge page |
| 8 | Sovereignty by Default | ✅ | Data export implemented in Account tab |
| 9 | Self-Improvement Has Guardrails | ✅ | Inbox requires explicit approve/reject for proposals |
| 10 | The System Explains Itself | ⚠️ | Audit page is mocked; no real per-injection explanation ("why this?") |

### 5.2 Principle Violations

**Principle:** The System Explains Itself (#10)  
**Violation:** Audit page shows only conversation summaries with hardcoded mock stats (tokens: ~1200, provider: auto) instead of real injection audit data  
**Location:** `src/app/(shell)/audit/page.tsx` — entire page is placeholder  
**Impact:** Users cannot verify what Chorum injected, or why — core transparency promise violated  
**Remediation:** Implement `getInjectionAudit()` Server Action querying the `injection_audit` table  

---

## Section 6: Build & Type Safety

### 6.1 Build Status

| Check | Result | Notes |
|-------|--------|-------|
| `npm run dev` startup | FAIL → FIXED | ECONNREFUSED in ShellLayout — fixed with `.catch(() => 0)` |
| TypeScript strict | UNKNOWN | Build not run post-fix; `any` types present |
| `@ts-ignore` count | 0 | None found |
| `any` type count | ~12 | Concentrated in chat.tsx and actions.ts |

### 6.2 Type Safety Issues

| File | Issue | Location | Justification |
|------|-------|----------|---------------|
| `chat/page.tsx` | `useState<any[]>` for personas | L50 | Personas don't have a shared type exported from Layer 3 |
| `actions.ts` | `payload: any` | L89 | AgentChatParams not fully typed at call site |
| `actions.ts` | `type: any` via cast | L154 | LearningType enum not re-exported from Layer 2 |
| `hooks.ts` | `useState<any[]>` for injectedContext | L20 | injectedContext item shape not formally typed |
| `inbox/page.tsx` | `useState<any[]>` for proposals | L13 | ConductorProposal not exported from Layer 1 |
| `settings/page.tsx` | 4× `useState<any[]>` | Various | Provider/persona types not re-exported |

**Verdict:** 12 `any` usages are a product of Layer 3/2 types not being consistently re-exported through the Shell's Server Action boundary. This is a Layer interface gap, not Shell-specific debt. Severity: Low (runtime safety), Medium (maintainability).

---

## Section 7: Test Coverage

### 7.1 Test Inventory

| Component | Test File | Happy Path | Edge Cases | Status |
|-----------|-----------|------------|------------|--------|
| HyggeButton | Not found | ❌ | ❌ | Missing |
| HyggeCard | Not found | ❌ | ❌ | Missing |
| HyggeToggle | Not found | ❌ | ❌ | Missing |
| HyggeModal | Not found | ❌ | ❌ | Missing |
| Shell actions | Not found | ❌ | ❌ | Missing |
| `useChat` hook | Not found | ❌ | ❌ | Missing |

### 7.2 Missing Critical Tests

The spec called for `src/__tests__/shell/components.test.tsx` and `src/__tests__/shell/actions.test.ts`. Neither was created.

| Component | Missing Test | Risk |
|-----------|--------------|------|
| HyggeToggle | onChange called with opposite value | Regression if toggle logic changes |
| HyggeModal | Renders nothing when open={false} | Portal leak |
| `getKnowledge` | Returns items array | Data shape regressions break Knowledge page |
| `submitFeedback` | Signal correctly passed to ChorumClient | Core learning loop silently broken |

**Verdict:** Zero Shell tests created. Acceptable only because this is the presentation layer — all critical business logic is tested in Layers 0–3. Recommend adding component smoke tests in Phase 6.

---

## Section 8: Documentation Sync

### 8.1 Documentation Status

| Document | Matches Code | Needs Update |
|----------|--------------|--------------|
| `PHASE_5_SPEC.md` | ✅ Mostly | Addendum A7 adds `callProvider` exception — now in code |
| `CHANGELOG.md` | ❌ Not checked | Entry for `[2.0.0-alpha.5]` needs to be written |
| Layer exceptions list | ⚠️ | `@/db` imports in `actions.ts` not in spec exceptions list |

### 8.2 Spec Drift

| Spec | Section | Code Reality | Spec Says |
|------|---------|--------------|-----------|
| PHASE_5_SPEC.md | Step 9 (actions) | Direct `@/db` imports for conversation persistence | Spec only documented `createBinaryStar` and `callProvider` as exceptions |
| PHASE_5_SPEC.md | Addendum A1 | Template import calls `/api/templates/*` (broken fetch) | Should call Server Action + `addLearning()` loop |
| PHASE_5_SPEC.md | Step 8 (Audit) | Page is mocked | Full `injection_audit` table query specified |

---

## Section 9: Debt Assessment

### 9.1 Technical Debt Inventory

| Item | Location | Type | Severity | Defer? |
|------|----------|------|----------|--------|
| Template import stub (`fetch('/api/templates/...')`) | `knowledge/page.tsx:57-61` | Broken feature | High | No |
| Missing template JSON files | `src/lib/shell/templates/` | Missing deliverable | High | No |
| Audit page is fully mocked | `audit/page.tsx:40-59` | Placeholder | High | No |
| `injectedContext` items have no `id` field | `hooks.ts:90-100` | Interface gap with Layer 3 | High | No |
| ~12 `any` type usages | Various shell files | Type debt | Low | Yes |
| Zero automated tests for Shell | n/a | Test debt | Low | Yes (Phase 6) |
| Token management UI in Account tab deferred | `settings/page.tsx:201-204` | Documented TODO | Low | Yes (Phase 6) |

### 9.2 TODO/FIXME Audit

| File | Content | Phase to Address |
|------|---------|-----------------|
| `audit/page.tsx:40` | "true audit viewer would reconstruct exact DB injections" | Phase 5.1 (now) |
| `settings/page.tsx:201` | "Token management UI to be implemented in a future iteration" | Phase 6 |
| `knowledge/page.tsx:56` | "Simplistic import simulation" | Phase 5.1 (now) |
| `chat/page.tsx:49` | "Personas fetch simulated for selector" | Phase 5.1 (now) |

### 9.3 Debt Verdict

**Total debt items:** 7  
**Critical (must fix before Phase 6):** 4  
**Acceptable (can defer):** 3  
**Recommendation:** PAUSE AND FIX the 4 critical items before declaring Phase 5 done

---

## Section 10: Phase Completion Verdict

### Summary Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Spec Compliance | 72 | 25% | 18.0 |
| Interface Contracts | 70 | 20% | 14.0 |
| Layer Boundaries | 85 | 20% | 17.0 |
| Guardian Skills | 80 | 15% | 12.0 |
| Design Principles | 78 | 10% | 7.8 |
| Build/Type Safety | 55 | 5% | 2.75 |
| Test Coverage | 20 | 5% | 1.0 |
| **TOTAL** | | **100%** | **72.55** |

### Verdict

**Phase 5 Status: ⚠️ CONDITIONAL — Strongly recommend fixing before declaring complete**

Score: 72.55 — in the "CONDITIONAL — strongly recommend fixing first" band.

### Blocking Issues (must resolve before Phase 6)

1. **Template import is broken** — `importTemplate()` calls `/api/templates/*` which doesn't exist. Template JSON files also missing. Create `src/lib/shell/templates/*.json` + Server Action that loops `addLearning()`.

2. **Audit page is entirely mocked** — shows "No detailed audit data available" with hardcoded strings. Violates The System Explains Itself principle. Query `injection_audit` table.

3. **`injectedContext` items have no `id` field** — feedback buttons wire through to `submitFeedback(item.id, signal)` but `item.id` is always `undefined`. The learning loop is silently broken. Requires either: (a) structured injected context from `AgentInterface` with IDs, or (b) content-based lookup.

4. **Missing changelog entry** — `CHANGELOG.md` has no `[2.0.0-alpha.5]` entry as specified.

### Conditional Items (can defer with documented risk)

1. **~12 `any` types** — Risk: type regressions won't be caught at compile time. Mitigate by exporting concrete types from the relevant Layer 2/3 modules.
2. **Zero Shell tests** — Risk: UI regressions won't be detected. Mitigate in Phase 6.
3. **Token management UI** — Risk: MCP Bearer token creation requires DB access. Deferred by spec.

### Recommendations

1. **Implement `importTemplate` Server Action** — reads static JSON from `src/lib/shell/templates/`, calls `addLearning()` in a loop, return count of created learnings. This unblocks the onboarding flow.
2. **Implement `getInjectionAudit` Server Action** — query `injection_audit` JOIN `learnings` WHERE `user_id = currentUser`. Replace the mocked audit page content.
3. **Fix injectedContext ID problem** — update `AgentInterface.chatSync()` response or the `hooks.ts` parser to extract learning IDs from the context string. Without IDs, feedback is silently discarded.
4. **Write CHANGELOG entry** — one-liner task but required by spec and Phase 5 → 6 transition checklist.

### Bugs Fixed During Review

| Bug | File | Fix |
|-----|------|-----|
| ECONNREFUSED crashes ShellLayout | `(shell)/layout.tsx:18` | `.catch(() => 0)` on `getPendingProposalCount` |
| `userId = 'user-1'` in Settings | `settings/page.tsx:220` | `getCurrentUserId()` Server Action |
| `handleFeedback` was a no-op stub | `chat/page.tsx:79-86` | Wired to `submitFeedback()`, added `ratedItems` state |
| Variable shadowing in `searchKnowledge` | `actions.ts:177` | Renamed `conversations` → `matchedConvs` |
| Missing `getCurrentUserId` export | `actions.ts` | Added public Server Action |

### Sign-off

- [ ] Template import functional (3 JSON files + Server Action)
- [ ] Audit page queries real `injection_audit` table
- [ ] `injectedContext` items carry `id` field for feedback loop
- [ ] CHANGELOG `[2.0.0-alpha.5]` entry written
- [x] ECONNREFUSED startup crash fixed
- [x] Settings page userId fixed
- [x] Feedback UX wired through
- [ ] Human review completed
- [ ] Ready for Phase 6
