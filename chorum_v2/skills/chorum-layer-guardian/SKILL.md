# Skill: Chorum Layer Guardian

> **Trigger:** Any implementation task, code review, or file creation across any layer
> **Purpose:** Enforce layer boundary compliance before code is written or merged
> **Best Model:** Sonnet 4.6 (fast, runs as inline check on every change) | **Codex** (code generation partner — run this skill on every Codex-generated file before accepting)

---

## The One Question This Skill Answers

> *Does this feature belong to the layer it's being implemented in?*

---

## Layer Definitions

| Layer | Name | Directory | Responsibility | Knows About |
|-------|------|-----------|----------------|-------------|
| 0 | Zettelkasten (Nebula) | `src/lib/nebula/` | Persistent knowledge graph | Nothing above it |
| 1 | Binary Star Core | `src/lib/core/` | Podium (injection) + Conductor (feedback) | Layer 0 only |
| 2 | Customization | `src/lib/config/` | Nerd knobs, domain profiles, MCP surface | Layers 0-1 only |
| 3 | Agents | `src/lib/agents/` | Personas, task-specific tuning, guardrails | Layers 0-2 only |
| 4 | Shell | `src/app/` | UI, CLI, API routes | All layers (but stateless) |

---

## Invariants (Rules That Can Never Be Violated)

### Import Direction
```
Layer 0 ← Layer 1 ← Layer 2 ← Layer 3 ← Layer 4
         (imports flow inward only)
```

- ❌ `src/lib/nebula/` CANNOT import from `src/lib/core/`
- ❌ `src/lib/core/` CANNOT import from `src/lib/agents/`
- ❌ `src/lib/config/` CANNOT import from `src/app/`
- ✅ `src/app/` CAN import from any `src/lib/*`

### Business Logic Placement

| Logic Type | Allowed Layer | Forbidden Layer |
|------------|---------------|-----------------|
| Graph queries, node CRUD | Layer 0 | Layers 1-4 |
| Relevance scoring, injection decisions | Layer 1 | Layers 0, 2-4 |
| Confidence adjustment, feedback processing | Layer 1 | Layers 0, 2-4 |
| Config loading, domain profile resolution | Layer 2 | Layers 0-1, 3-4 |
| Persona application, routing rules | Layer 3 | Layers 0-2, 4 |
| Request handling, response formatting | Layer 4 | Layers 0-3 |

### Shell Layer (Layer 4) Constraints

The Shell is **always stateless**. It may:
- ✅ Call layer interfaces
- ✅ Transform data for display
- ✅ Handle auth/session
- ❌ Store application state
- ❌ Contain business logic
- ❌ Make decisions about injection/feedback

---

## Compliance Checklist

Run this checklist against every proposed file change:

### 1. File Location Check
```
□ Is the file in the correct directory for its layer?
□ If creating a new file, does the directory match the feature's layer?
```

### 2. Import Analysis
```
□ List all imports in the file
□ For each import from src/lib/*, identify the source layer
□ Verify: source layer number < current file's layer number
□ Flag any import that violates direction (outer importing inner)
```

### 3. Business Logic Audit
```
□ Identify the primary logic in the file
□ Match it to a logic type from the table above
□ Verify the file's layer matches the allowed layer
□ Flag any misplaced business logic
```

### 4. Shell Statelessness Check (Layer 4 only)
```
□ Does the file use useState/useReducer for app state (not UI state)?
□ Does the file make injection/feedback decisions?
□ Does the file contain scoring/ranking logic?
□ If any are true, flag as business logic leak
```

---

## Output Format

When reviewing code, return:

```markdown
## Layer Guardian Verdict

**File:** `src/lib/core/podium.ts`  
**Detected Layer:** 1 (Binary Star Core)  
**Expected Layer:** 1

### Import Analysis
| Import | Source Layer | Verdict |
|--------|--------------|---------|
| `../nebula/queries` | 0 | ✅ PASS |
| `../agents/persona` | 3 | ❌ FAIL - Layer 1 cannot import Layer 3 |

### Business Logic Check
| Logic Found | Expected Layer | Verdict |
|-------------|----------------|---------|
| Relevance scoring | 1 | ✅ PASS |

### Overall: ❌ FAIL

**Violations:**
1. Import from Layer 3 (`../agents/persona`) in Layer 1 file

**Recommended Fix:**
Move persona-dependent logic to Layer 3, or pass persona config as parameter from Layer 3 caller.
```

---

## Common Violation Patterns (From v1)

### Pattern 1: API Route Business Logic
```typescript
// ❌ WRONG: Business logic in src/app/api/chat/route.ts
const relevantLearnings = await scoreAndRankLearnings(query);

// ✅ RIGHT: Call layer interface
const relevantLearnings = await podium.getContext(query);
```

### Pattern 2: Nebula Knowing About Injection
```typescript
// ❌ WRONG: src/lib/nebula/learnings.ts
import { shouldInject } from '../core/podium';

// ✅ RIGHT: Nebula only does CRUD
export async function getLearningsByScope(scopes: string[]) { ... }
```

### Pattern 3: Config in Core
```typescript
// ❌ WRONG: src/lib/core/conductor.ts
const decayCurve = await loadDomainProfile(domain).decay;

// ✅ RIGHT: Config passed in from Layer 2
export async function processSignal(signal: Signal, config: ConductorConfig) { ... }
```

---

## Integration Points

This skill should be invoked:
1. Before any PR/commit that touches `src/lib/` or `src/app/`
2. As part of automated CI checks
3. When an LLM proposes file creation/modification

---

## Success Criteria

A codebase passes Layer Guardian when:
- Zero import direction violations
- Zero business logic placement violations
- All Shell files are stateless
- Every new feature has an explicit layer assignment before implementation

---

## Codex Partner Notes

This skill is the **first gate** on every Codex-generated file. Run before any other skill.

**Common Codex patterns to watch for:**
- Codex often places scoring/injection logic directly in `src/app/api/` routes (v1 pattern) — must be in `src/lib/core/podium/` (Layer 1)
- Codex may import Nebula functions directly from API routes, bypassing the Binary Star interface
- Codex may put confidence adjustment logic in Shell layer components — all confidence logic belongs in Layer 1 (Conductor)
- Codex generating Phase 4 (Agent) code may import directly from Layer 0 — must go through the Layer 1 interface
- When Codex generates a file, the first question is always: **what layer does this belong to?** If the answer is unclear, the feature isn't ready to be built yet.
