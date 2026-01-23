# Chorum AI - Feature Roadmap & Architecture

> **GSD Principles Applied**: Ship fast, iterate, prove value. Each feature is scoped to a single sprint with clear acceptance criteria. Audit after implementation.

---

## 🎯 Current Priority Stack

| Priority | Feature | Status | Sprint |
|----------|---------|--------|--------|
| **P0** | Data Portability (Export/Import) | ✅ Implemented (Audited) | Sprint 1 |
| **P1** | API / CLI Mode (H4X0R) | ✅ Implemented | Sprint 2 |
| **P1** | Global Memory Layer | ⚪ Backlog | Sprint 3 |
| P2 | Proactive Nudges | ⚪ Backlog | - |
| P2 | Agent Pipelines | ⚪ Backlog | - |
| P3 | Conversation Branching | ⚪ Backlog | - |
| P4 | Federated/Team Memory | ⚪ Backlog | - |

---

# P0: Data Portability

## Overview

**Problem:** Chorum's value is the sovereign memory it builds—but there's no way to export, backup, or migrate it. Users cannot take their AI-learned context with them.

**Solution:** A comprehensive Export/Import system that creates portable, human-readable archives of project data.

## Architecture

### Export Data Model

The export format is a **single JSON file** with optional asset directories. It captures all user-specific, non-sensitive data.

```
project_export_<name>_<timestamp>.json
├── metadata: { exportVersion, exportedAt, chorumVersion }
├── project: { id, name, description, techStack, customInstructions }
├── learning: [
│   ├── patterns: { id, content, context, metadata }[]
│   ├── antipatterns: { id, content, context, metadata }[]
│   ├── decisions: { id, content, context, metadata }[]
│   ├── invariants: { id, content, context, metadata }[]
│   └── goldenPaths: { id, content, context, metadata }[]
├── confidence: { score, decayRate, interactionCount, ... }
├── criticalFiles: { filePath, linkedInvariants }[]
├── memorySummaries: { summary, messageCount, fromDate, toDate }[]
├── customAgents: { name, config }[]  // Only project-specific agents
└── conversations (optional): [
    ├── { title, messages: [{ role, content, provider, cost }] }
]
```

### Database Tables to Export

| Table | Export? | Notes |
|-------|---------|-------|
| `projects` | ✅ | Core project metadata |
| `projectLearningPaths` | ✅ | Patterns, invariants, decisions |
| `projectConfidence` | ✅ | Confidence score |
| `projectFileMetadata` | ✅ | Critical files |
| `memorySummaries` | ✅ | AI-generated summaries |
| `customAgents` | ✅ (optional) | User's custom agents |
| `conversations` | ✅ (optional) | Full chat history |
| `messages` | ✅ (optional) | Individual messages |
| `providerCredentials` | ❌ | **Never export** API keys |
| `usageLog` | ❌ | Non-portable usage data |
| `routingLog` | ❌ | Non-portable routing data |
| `auditLogs` | ❌ | Non-portable audit data |

### Export API Specification

#### `POST /api/export/project`

**Request:**
```typescript
{
  projectId: string
  options: {
    includeConversations: boolean  // Default: false (privacy)
    includeAgents: boolean         // Default: true
    format: 'json' | 'zip'         // Default: 'json'
  }
}
```

**Response:**
- `Content-Type: application/json` or `application/zip`
- `Content-Disposition: attachment; filename="..."`
- Returns the export payload or downloadable file

### Import API Specification

#### `POST /api/import/project`

**Request:**
```typescript
{
  exportData: ExportPayload  // Parsed JSON from file upload
  options: {
    mergeExisting: boolean   // If project name exists, merge or fail?
    importConversations: boolean
  }
}
```

**Response:**
```typescript
{
  success: boolean
  projectId: string  // New or merged project ID
  stats: {
    patternsImported: number
    invariantsImported: number
    conversationsImported: number
    // ...
  }
  warnings: string[]  // E.g., "Skipped 2 duplicate patterns"
}
```

### UI Integration

#### Export Flow
1. User navigates to **Project Settings** (or right-click project in Sidebar)
2. Clicks **"Export Project"** button
3. Modal appears with options:
   - [ ] Include conversation history
   - [ ] Include custom agents
4. User clicks **"Download Export"**
5. Browser downloads `.json` file

#### Import Flow
1. User clicks **"+" → "Import Project"** in Sidebar header
2. File picker opens, user selects `.json` file
3. Preview modal shows:
   - Project name, patterns count, etc.
   - Option to merge if project name exists
4. User clicks **"Import"**
5. Success toast with stats

### Security Considerations

> [!CAUTION]
> **Never export API keys or sensitive credentials.**

1. **PII in Conversations**: If exporting conversations, warn user that messages may contain sensitive data.
2. **Import Validation**: Validate JSON schema strictly to prevent injection attacks.
3. **ID Regeneration**: On import, generate new UUIDs for all entities to avoid collisions.
4. **Version Check**: Reject imports from significantly newer Chorum versions.

## Acceptance Criteria

- [x] User can export a project as a single `.json` file
- [x] User can import a `.json` file to create a new project
- [x] Learned patterns, invariants, and decisions are preserved after round-trip
- [x] Custom agents are optionally exported/imported
- [x] No API keys or sensitive credentials are ever included
- [x] Import handles duplicate detection gracefully

## File Changes

| File | Change |
|------|--------|
| `src/app/api/export/project/route.ts` | **[DONE]** Export endpoint |
| `src/app/api/import/project/route.ts` | **[DONE]** Import endpoint |
| `src/lib/portability/types.ts` | **[DONE]** Export format types |
| `src/lib/portability/exporter.ts` | **[DONE]** Export logic |
| `src/lib/portability/importer.ts` | **[DONE]** Import logic |
| `src/lib/portability/validator.ts` | **[DONE]** Schema validation (Zod v4 compatible) |
| `src/lib/portability/portability.test.ts` | **[DONE]** Test suite (8 tests) |
| `src/components/Sidebar.tsx` | **[PENDING]** Add Import button |
| `src/components/ProjectSettingsModal.tsx` | **[PENDING]** Export UI |

---

## P0 Audit Report: Data Portability

> **Audit Date:** 2026-01-21
> **Auditor:** Claude Opus 4.5
> **Scope:** Security (OWASP), Functionality, Data Sovereignty

### Functional Testing Results

| Test | Status | Notes |
|------|--------|-------|
| Valid payload validation | ✅ PASS | Schema correctly validates complete exports |
| JSON round-trip | ✅ PASS | Serialize → Parse → Validate succeeds |
| Missing required fields | ✅ PASS | Rejects invalid structure |
| Invalid nested fields | ✅ PASS | Deep validation works |
| Optional conversations | ✅ PASS | Privacy-first default |
| Empty arrays | ✅ PASS | New projects exportable |
| Export size | ✅ PASS | ~4KB for sample project |
| Sensitive field check | ✅ PASS | No apiKey/password/token fields |

**Run tests:** `npx tsx src/lib/portability/portability.test.ts`

### OWASP Top 10 Security Audit

| Vuln | Rating | Finding | Remediation |
|------|--------|---------|-------------|
| **A01: Broken Access Control** | ✅ GOOD | Export verifies `userId` ownership; Import assigns to authenticated user | - |
| **A02: Cryptographic Failures** | ✅ GOOD | No sensitive data (API keys) exported; Conversations opt-in | Consider: Warn users about PII in conversations |
| **A03: Injection** | ⚠️ MEDIUM | Drizzle ORM uses parameterized queries; Zod validates input | **TODO:** Sanitize `content` fields if rendered as HTML |
| **A04: Insecure Design** | ⚠️ MEDIUM | No version compatibility check; No file size limit | **TODO:** Add `MAX_IMPORT_SIZE` (e.g., 10MB); Reject future versions |
| **A05: Security Misconfiguration** | ✅ GOOD | Errors don't leak internal details | - |
| **A06: Vulnerable Components** | ℹ️ N/A | Requires separate dependency audit | - |
| **A07: Auth Failures** | ✅ GOOD | Uses session-based auth via `auth()` | - |
| **A08: Data Integrity** | ⚠️ LOW | No checksum/signature on exports | Consider: Add SHA-256 hash for integrity verification |
| **A09: Logging Failures** | ⚠️ MEDIUM | Only `console.error` on failures | **TODO:** Add audit log entries for exports/imports |
| **A10: SSRF** | ✅ GOOD | No external requests made | - |

### Data Sovereignty Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| User owns their data | ✅ | Full export of project memory, patterns, and conversations |
| Portable format | ✅ | Standard JSON, human-readable |
| No vendor lock-in | ✅ | Export contains all learned context |
| Credentials excluded | ✅ | `providerCredentials` table explicitly not exported |
| PII warning | ⚠️ | **TODO:** Add UI warning when exporting conversations |

### Code Quality Issues Found

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `exporter.ts` | 182 | Uses `any` type in `mapLearningItem` | Low |
| `validator.ts` | 30 | `z.record(z.unknown())` incompatible with Zod v4 | Fixed |
| `importer.ts` | - | No transaction timeout | Medium |
| `importer.ts` | - | No array length limits (DoS vector) | Medium |

### Recommended Follow-up Tasks

1. **[Security]** Add `MAX_ITEMS` limits to import arrays (prevent memory exhaustion)
2. **[Security]** Add audit log entries for export/import actions
3. **[UX]** Add UI warning when exporting conversations (PII risk)
4. **[UX]** Complete Sidebar Import button and ProjectSettingsModal Export button
5. **[Integrity]** Consider adding export checksum for tamper detection
6. **[Compat]** Add version check to reject imports from newer Chorum versions

---

# P1: API / CLI Mode

> **Status:** Backlog

## Overview

Power users want to invoke Chorum from a terminal, IDE, or script. This feature provides a `chorum-cli` tool that uses the same routing, memory, and providers as the web UI.

## Key Commands

```bash
chorum ask "refactor this function"
chorum ask --agent architect "design a caching layer"
chorum review --file src/app.ts --focus security
chorum export --project myproject -o backup.json
chorum import backup.json
```

## Architecture Notes

- **Auth**: Use API tokens stored in `~/.chorum/config.json`
- **Transport**: Reuse existing `/api/chat` endpoint
- **MCP Integration**: Expose as an MCP server for IDE-native access

---

# P1: Global Memory Layer

> **Status:** Backlog

## Overview

Currently, memory is siloed per-project. This feature adds a **user-level memory layer** that persists across all projects.

## Data Model

```
users.globalMemory: {
  preferences: { ... }         // Coding style, communication preferences
  crossProjectPatterns: [...]  // Patterns that apply everywhere
  globalInvariants: [...]      // Rules that NEVER break
}
```

## Key Features

1. **Preference Learning**: "I prefer tabs over spaces" → Injected into all projects
2. **Global Invariants**: "Never commit API keys" → Checked everywhere
3. **Cross-Project Wisdom**: Pattern from Project A suggested in Project B

---

# Relevance Gating Audit Report

> **Audit Date:** 2026-01-22
> **Auditor:** Claude Opus 4.5
> **Scope:** Functionality, Security (OWASP), Performance, Spec Compliance

## Implementation Summary

The Relevance Gating system has been implemented across 7 files:

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/chorum/classifier.ts` | Query classification & budget assignment | 114 |
| `src/lib/chorum/relevance.ts` | Scoring engine & memory selection | 174 |
| `src/lib/chorum/embeddings.ts` | Local vector embeddings (MiniLM) | 82 |
| `src/lib/learning/injector.ts` | Integration layer for chat route | 159 |
| `src/lib/learning/validator.ts` | Response validation against invariants | 211 |
| `src/lib/learning/manager.ts` | CRUD for learning items & confidence | 249 |
| `src/lib/learning/types.ts` | Type definitions | 83 |

## Functional Testing Results

| Test Suite | Tests | Status |
|------------|-------|--------|
| Classifier (trivial, auth, code detection) | 3 | ✅ PASS |
| Relevance Engine (scoring, invariant priority) | 2 | ✅ PASS |
| Security Audit (input validation) | 3 | ✅ PASS |
| Security Audit (budget boundaries) | 2 | ✅ PASS |
| Security Audit (robustness) | 3 | ✅ PASS |
| Security Audit (performance) | 1 | ✅ PASS |
| Security Audit (output safety) | 2 | ✅ PASS |
| Security Audit (thresholds) | 2 | ✅ PASS |
| **Total** | **18** | ✅ ALL PASS |

**Run tests:** `npx tsx src/lib/chorum/relevance.test.ts && npx tsx src/lib/chorum/security-audit.test.ts`

## Spec Compliance

| Spec Requirement | Status | Implementation |
|------------------|--------|----------------|
| Query Classification (<50ms) | ✅ | Rule-based, ~2ms actual |
| Token Budget Tiers (0/500/2K/5K/8K) | ✅ | `calculateBudget()` in classifier.ts |
| 10K Token Ceiling | ✅ | Hard cap enforced |
| Relevance Scoring (semantic + recency + domain + usage + type) | ✅ | Weighted formula in relevance.ts:68-74 |
| Invariant Type Boost (0.25) | ✅ | relevance.ts:59 |
| Lower Threshold for Invariants (0.2 vs 0.35) | ✅ | relevance.ts:95 |
| Context Assembly (structured markdown) | ✅ | `assembleContext()` with XML tags |
| Local Embeddings (all-MiniLM-L6-v2) | ✅ | @xenova/transformers v2.17.2 |
| Pre-compute Embeddings | ⚠️ PARTIAL | Schema supports it, but no background job |

## OWASP Top 10 Security Audit

| Vuln | Rating | Finding | Remediation |
|------|--------|---------|-------------|
| **A01: Broken Access Control** | ✅ GOOD | All DB queries filter by `projectId`; Project ownership verified via session in route.ts:76-89 | - |
| **A02: Cryptographic Failures** | ✅ GOOD | No secrets in relevance system; Embeddings are non-sensitive | - |
| **A03: Injection** | ✅ GOOD | Drizzle ORM uses parameterized queries; No raw SQL; Regex in validator.ts:88 is user-controlled but caught in try/catch | - |
| **A04: Insecure Design** | ⚠️ MEDIUM | No max items limit on learning items fetched | **TODO:** Add `LIMIT 1000` to `getProjectLearning()` |
| **A05: Security Misconfiguration** | ✅ GOOD | Errors logged to console, not exposed to client | - |
| **A06: Vulnerable Components** | ℹ️ INFO | `@xenova/transformers` v2.17.2 - check for CVEs periodically | - |
| **A07: Auth Failures** | ✅ GOOD | Session auth checked before any operations | - |
| **A08: Data Integrity** | ✅ GOOD | Embeddings stored in DB with pgvector type; No tampering vector | - |
| **A09: Logging Failures** | ⚠️ LOW | Good observability logs in route.ts:146; No formal audit trail | Consider: Add audit log for relevance injection stats |
| **A10: SSRF** | ✅ GOOD | No external requests in relevance system | - |

## Performance Analysis

| Operation | Target (Spec) | Actual | Status |
|-----------|---------------|--------|--------|
| Query Classification | <50ms | ~2ms | ✅ Excellent |
| Embedding Generation | <100ms | N/A (lazy loaded) | ✅ Cached after first use |
| Relevance Scoring (5K items) | <50ms | ~40ms | ✅ Good |
| Memory Selection | <10ms | <1ms | ✅ Excellent |
| **Total Pipeline** | <220ms | <50ms (excluding first embedding) | ✅ Excellent |

## Code Quality Findings

| File | Issue | Severity | Line |
|------|-------|----------|------|
| `classifier.ts` | Magic numbers for thresholds (10, 200, 500, 20) | Low | 58-66 |
| `relevance.ts` | Sort mutates original array | Low | 85 |
| `embeddings.ts` | No retry logic on model load failure | Medium | 38-48 |
| `injector.ts` | Dead code: trivial budget early exit doesn't skip DB fetch | Low | 56-67 |
| `validator.ts` | Regex in checkType='regex' could be ReDoS vector with malicious patterns | Medium | 88 |

## Security Hardening ✅ COMPLETED

All Priority 1 recommendations have been implemented:

### Priority 1 (Implemented)

1. ✅ **Add Item Limit to DB Query**
   ```typescript
   // manager.ts:24,34
   const MAX_LEARNING_ITEMS = 1000
   .limit(MAX_LEARNING_ITEMS)
   ```

2. ✅ **Add ReDoS Protection for Custom Regex Invariants**
   ```typescript
   // validator.ts:118-143 - isRegexSafe() function
   // Checks: length limit, nested quantifiers, overlapping alternation
   if (!isRegexSafe(checkValue)) return false
   ```

3. ✅ **Add Retry Logic to Embeddings Service**
   ```typescript
   // embeddings.ts:3-8, 47-95
   // Exponential backoff with jitter, 3 max attempts
   ```

### Priority 2 (Implemented)

4. ✅ **Immutable Sort in selectMemory**
   ```typescript
   // relevance.ts:85
   const sorted = [...candidates].sort(...)  // Don't mutate input
   ```

5. ✅ **Extract Magic Numbers to Constants**
   ```typescript
   // classifier.ts:28-63
   // THRESHOLDS, TOKEN_BUDGETS, BUDGET_MODIFIERS
   ```

### Priority 3 (Backlog)

6. **Pre-compute Embeddings on Learning Item Creation**
   - Add background job or trigger to generate embeddings when items are added
   - Currently only query embeddings are generated at request time

7. **Add Relevance Injection Metrics**
   - Track: items scored, items selected, token budget used, latency
   - Useful for tuning scoring weights

8. **UI Refactor - Adoption of the "Sovereign Minimalism"**
   - Omnibar - Replace the complex input cluster with a single, unified "Omnibar" inspired by Claude/Linear.
      1. Agent Selection: Integrated into the left side of the input bar. Shows current agent icon (or "Auto"). Click to open a popover/command menu to switch.
      2. Provider Selection: Moved to "Settings" or a subtle toggle inside the agent popover.
      3. Visuals: One clean text area. No separate "Agent" or "Provider" dropdowns cluttering the main view.
      4. @agent inline switching - Type @architect mid-thought to route that specific message differently
      5. Cmd+K command palette - For power users who want to switch projects, change providers, or access settings without clicking
   - Collapsible Agent Drawer (Right Panel) - The Agent panel should not be a permanent column.
      1. Change: Convert Right Panel to a Collapsible Drawer.
      2. Default State: Closed (giving chat 75% width).
      3. Toggle: A simple "Agents" icon/button in the top-right header.
      4. Internal Layout: When open, use a Grid for agents instead of a long list, showing only Icon + Name. Hover for details/Semantic Focus.
   - Context Indicator in Omnibar
      1. Memory system is the product. Make it visible:
         [📊 Analyst ▾] [Ask Analyst...                    ] [⚡ 3 patterns active]
   -. Minimalist Sidebar (Left Panel) - Refining the navigation to focus on content.
      1. Footer: Remove large buttons. Replace with a minimal icon row: [Settings] [Import] [User Profile].
      2. New Project: Move to the Header as a small + icon next to "PROJECTS".
      3. Density: Reduce vertical padding on project list items.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/chorum/security-audit.test.ts` | **[NEW]** 13 security-focused tests |
| `src/lib/learning/manager.ts` | **[FIX]** Added MAX_LEARNING_ITEMS limit |
| `src/lib/learning/validator.ts` | **[FIX]** Added isRegexSafe() ReDoS protection |
| `src/lib/chorum/embeddings.ts` | **[FIX]** Added retry logic with exponential backoff |
| `src/lib/chorum/relevance.ts` | **[FIX]** Immutable sort in selectMemory |
| `src/lib/chorum/classifier.ts` | **[REFACTOR]** Extracted magic numbers to constants |

---

# Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-21 | Antigravity | Initial roadmap, P0 Data Portability architecture |
| 2026-01-21 | Gemini | Implemented Data Portability (P0) - Export/Import API & UI |
| 2026-01-21 | Claude Opus 4.5 | P0 Audit: OWASP security review, functional tests (8/8 pass), Zod v4 fix, data sovereignty validation |
| 2026-01-22 | Claude Opus 4.5 | Relevance Gating Audit: 18 tests pass, OWASP review, performance analysis, security recommendations |
| 2026-01-22 | Claude Opus 4.5 | Security Hardening: DB query limits, ReDoS protection, retry logic, immutable sort, extracted constants |
