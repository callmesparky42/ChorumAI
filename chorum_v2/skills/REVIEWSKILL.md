# Skill: Phase Review Agent

> **Trigger:** End of any implementation phase, before proceeding to next phase  
> **Purpose:** Comprehensive validation that implementation matches specs, checklists pass, and no drift has occurred  
> **Best Model:** Opus 4.6 (requires nuanced judgment on architectural compliance)

---

## The One Question This Skill Answers

> *Is this phase complete, correct, and safe to build upon — or are we accumulating debt?*

---

## When to Invoke This Agent

- ✅ After completing Phase N implementation, before starting Phase N+1
- ✅ After significant refactoring within a phase
- ✅ When uncertain if a change introduced drift
- ✅ Before any "release candidate" tag
- ❌ NOT for mid-implementation spot checks (use individual guardian skills for that)

---

## Required Context

Before running this review, ensure the following are in context:

```
□ CHORUM_V2_PHASE_ARCHITECTURE.md (or current version)
□ The_Shift.md (design principles)
□ The specific phase's spec document (e.g., NEBULA_SCHEMA_SPEC.md)
□ The deployment checklist (inter-phase protocol)
□ Access to the codebase (file listing + ability to read files)
```

---

## Review Protocol

### Section 1: Spec Compliance Audit

For each deliverable listed in the phase spec:

```markdown
### 1.1 Deliverable Inventory

| Deliverable | Spec Location | Implementation Location | Status |
|-------------|---------------|------------------------|--------|
| [Name from spec] | [Section in spec] | [File path or "MISSING"] | ✅/❌/⚠️ |

Legend:
- ✅ Implemented and matches spec
- ❌ Missing or fundamentally wrong
- ⚠️ Implemented but deviates from spec (explain below)
```

For any ⚠️ or ❌:

```markdown
### 1.2 Deviation Analysis

**Deliverable:** [Name]
**Expected (from spec):** [What spec says]
**Actual (in code):** [What code does]
**Severity:** Critical / Major / Minor
**Recommendation:** [Fix code / Update spec / Acceptable deviation]
**Justification:** [Why this recommendation]
```

---

### Section 2: Interface Contract Verification

For each TypeScript interface defined in the spec:

```markdown
### 2.1 Interface Match

| Interface | Spec Definition | Code Definition | Match |
|-----------|-----------------|-----------------|-------|
| PodiumRequest | PODIUM_INTERFACE_SPEC.md:L45-60 | src/lib/core/podium/types.ts:L12-27 | ✅/❌ |

### 2.2 Interface Discrepancies

**Interface:** [Name]
**Spec version:**
\`\`\`typescript
[Paste from spec]
\`\`\`

**Code version:**
\`\`\`typescript
[Paste from code]
\`\`\`

**Differences:**
- [Field X: spec says required, code says optional]
- [Field Y: spec says string, code says string | null]

**Resolution:** Update spec / Update code / Document as intentional
```

---

### Section 3: Layer Boundary Audit

Verify no layer violations exist:

```markdown
### 3.1 Import Direction Analysis

| File | Layer | Imports From | Violation? |
|------|-------|--------------|------------|
| src/lib/nebula/queries.ts | 0 | drizzle, pg | ✅ None |
| src/lib/core/podium/scorer.ts | 1 | ../nebula/queries | ✅ Valid (1→0) |
| src/lib/nebula/learnings.ts | 0 | ../core/conductor | ❌ VIOLATION (0→1) |

### 3.2 Violations Found

**File:** [path]
**Layer:** [N]
**Invalid Import:** [path]
**Target Layer:** [M]
**Rule Violated:** Layer N cannot import from Layer M (inner cannot know about outer)
**Fix:** [Specific recommendation]
```

---

### Section 4: Guardian Skill Results

Run each relevant guardian skill and record results:

```markdown
### 4.1 Guardian Skill Execution

| Skill | Applicable | Result | Issues |
|-------|------------|--------|--------|
| chorum-layer-guardian | ✅ | PASS/FAIL | [Count] |
| nebula-schema-guardian | ✅/N/A | PASS/FAIL | [Count] |
| podium-injection-agent | ✅/N/A | PASS/FAIL | [Count] |
| conductor-spec-agent | ✅/N/A | PASS/FAIL | [Count] |
| mcp-contract-agent | ✅/N/A | PASS/FAIL | [Count] |

### 4.2 Guardian Failures

**Skill:** [Name]
**Check Failed:** [Specific checklist item]
**Evidence:** [What was found]
**Required Fix:** [What must change]
```

---

### Section 5: Design Principles Compliance

Review against The_Shift.md principles:

```markdown
### 5.1 Principle Compliance Matrix

| # | Principle | Compliance | Evidence |
|---|-----------|------------|----------|
| 1 | The Graph is the Product | ✅/⚠️/❌ | [Brief note] |
| 2 | Binary Star Core | ✅/⚠️/❌ | [Brief note] |
| 3 | Capture Surfaces are Disposable | ✅/⚠️/❌ | [Brief note] |
| 4 | Layers Have Contracts | ✅/⚠️/❌ | [Brief note] |
| 5 | Token Economy is First-Class | ✅/⚠️/❌ | [Brief note] |
| 6 | Learning is Near-Real-Time | ✅/⚠️/❌ | [Brief note] |
| 7 | Domain Awareness is Structural | ✅/⚠️/❌ | [Brief note] |
| 8 | Sovereignty by Default | ✅/⚠️/❌ | [Brief note] |
| 9 | Self-Improvement Has Guardrails | ✅/⚠️/❌ | [Brief note] |
| 10 | The System Explains Itself | ✅/⚠️/❌ | [Brief note] |

### 5.2 Principle Violations

**Principle:** [Name]
**Violation:** [What code does that violates principle]
**Location:** [File:Line]
**Impact:** [Why this matters]
**Remediation:** [How to fix]
```

---

### Section 6: Build & Type Safety

```markdown
### 6.1 Build Status

| Check | Result | Notes |
|-------|--------|-------|
| `npx next build` | PASS/FAIL | [Error summary if fail] |
| TypeScript strict | PASS/FAIL | [Error count] |
| @ts-ignore count | [N] | [Acceptable: 0, Review if >0] |
| `any` type count | [N] | [List locations if >0] |
| ESLint | PASS/FAIL | [Warning count] |

### 6.2 Type Safety Issues

| File | Line | Issue | Justification Required |
|------|------|-------|----------------------|
| [path] | [N] | @ts-ignore | [Why is this here?] |
| [path] | [N] | : any | [Why not typed?] |
```

---

### Section 7: Test Coverage

```markdown
### 7.1 Test Inventory

| Component | Test File | Happy Path | Edge Cases | Invariant Tests |
|-----------|-----------|------------|------------|-----------------|
| Nebula CRUD | nebula.test.ts | ✅/❌ | ✅/❌ | ✅/❌ |
| Podium scoring | podium.test.ts | ✅/❌ | ✅/❌ | ✅/❌ |
| Conductor guardrails | conductor.test.ts | ✅/❌ | ✅/❌ | ✅/❌ |

### 7.2 Missing Critical Tests

| Component | Missing Test | Risk |
|-----------|--------------|------|
| [Name] | [What should be tested] | [What could go wrong] |
```

---

### Section 8: Documentation Sync

```markdown
### 8.1 Documentation Status

| Document | Last Updated | Matches Code | Needs Update |
|----------|--------------|--------------|--------------|
| CHANGELOG.md | [Date] | ✅/❌ | [What's missing] |
| README.md | [Date] | ✅/❌ | [What's missing] |
| Phase spec | [Date] | ✅/❌ | [What changed] |
| API docs | [Date] | ✅/❌ | [What's missing] |

### 8.2 Spec Drift

If implementation required spec changes that weren't backported:

| Spec | Section | Code Reality | Spec Says |
|------|---------|--------------|-----------|
| [Doc] | [Section] | [What code does] | [What spec claims] |
```

---

### Section 9: Debt Assessment

```markdown
### 9.1 Technical Debt Inventory

| Item | Location | Type | Severity | Defer OK? |
|------|----------|------|----------|-----------|
| [Description] | [File:Line] | Shortcut/Workaround/TODO | High/Med/Low | Yes/No |

### 9.2 TODO/FIXME/HACK Audit

| File | Line | Marker | Content | Phase to Address |
|------|------|--------|---------|------------------|
| [path] | [N] | TODO | [Text] | [Which phase] |

### 9.3 Debt Verdict

**Total debt items:** [N]
**Critical (must fix before next phase):** [N]
**Acceptable (can defer):** [N]
**Recommendation:** PROCEED / PAUSE AND FIX
```

---

### Section 10: Phase Completion Verdict

```markdown
## Final Verdict

### Summary Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Spec Compliance | [0-100] | 25% | [N] |
| Interface Contracts | [0-100] | 20% | [N] |
| Layer Boundaries | [0-100] | 20% | [N] |
| Guardian Skills | [0-100] | 15% | [N] |
| Design Principles | [0-100] | 10% | [N] |
| Build/Type Safety | [0-100] | 5% | [N] |
| Test Coverage | [0-100] | 5% | [N] |
| **TOTAL** | | 100% | **[N]** |

### Verdict

**Phase [N] Status:** ✅ COMPLETE / ⚠️ CONDITIONAL / ❌ BLOCKED

### Blocking Issues (must resolve before Phase N+1)

1. [Issue]
2. [Issue]

### Conditional Items (should resolve, can defer with documented risk)

1. [Issue] — Risk: [What could go wrong]
2. [Issue] — Risk: [What could go wrong]

### Recommendations

1. [Action item]
2. [Action item]
3. [Action item]

### Sign-off

- [ ] All blocking issues resolved
- [ ] Human review completed
- [ ] CHANGELOG updated
- [ ] Ready for Phase [N+1]
```

---

## Output Template

When invoked, produce a complete review document:

```markdown
# Phase [N] Review Report

**Date:** [YYYY-MM-DD]  
**Reviewer:** [Model name/version]  
**Phase:** [Phase name]  
**Commit/State:** [Git commit or description]

---

[Section 1: Spec Compliance Audit]

---

[Section 2: Interface Contract Verification]

---

[Section 3: Layer Boundary Audit]

---

[Section 4: Guardian Skill Results]

---

[Section 5: Design Principles Compliance]

---

[Section 6: Build & Type Safety]

---

[Section 7: Test Coverage]

---

[Section 8: Documentation Sync]

---

[Section 9: Debt Assessment]

---

[Section 10: Phase Completion Verdict]
```

---

## Scoring Guidelines

### Spec Compliance (25%)
- 100: All deliverables present and match spec exactly
- 80: All deliverables present, minor deviations documented
- 60: Most deliverables present, some gaps
- 40: Significant gaps or deviations
- 0: Spec largely ignored

### Interface Contracts (20%)
- 100: All interfaces match spec exactly
- 80: Minor type differences (e.g., optional vs required on non-critical fields)
- 60: Some interfaces differ, changes documented
- 40: Significant drift between spec and code
- 0: Interfaces unrecognizable from spec

### Layer Boundaries (20%)
- 100: Zero violations, all files in correct directories
- 80: Zero violations, minor organizational issues
- 60: 1-2 violations, easily fixable
- 40: Multiple violations, architectural concern
- 0: Layer model not followed

### Guardian Skills (15%)
- 100: All applicable guardians pass
- 80: All pass with minor warnings
- 60: 1 guardian fails, others pass
- 40: Multiple failures
- 0: Guardians not run or mostly failing

### Design Principles (10%)
- 100: All 10 principles clearly upheld
- 80: 8-9 principles upheld, minor concerns on 1-2
- 60: Clear violation of 1-2 principles
- 40: Multiple principle violations
- 0: Principles ignored

### Build/Type Safety (5%)
- 100: Clean build, zero ts-ignore, zero any
- 80: Clean build, <3 justified exceptions
- 60: Build passes with warnings
- 40: Build requires fixes
- 0: Build broken

### Test Coverage (5%)
- 100: All components tested, including invariants
- 80: Happy paths covered, some edge cases
- 60: Basic tests exist
- 40: Minimal testing
- 0: No tests

---

## Thresholds

| Score | Verdict | Action |
|-------|---------|--------|
| 90-100 | ✅ COMPLETE | Proceed to next phase |
| 75-89 | ⚠️ CONDITIONAL | Proceed with documented risks, or fix first |
| 60-74 | ⚠️ CONDITIONAL | Strongly recommend fixing before proceeding |
| <60 | ❌ BLOCKED | Must resolve issues before next phase |

---

## Integration with CI/CD

This skill can be automated as a pre-merge check:

```yaml
# .github/workflows/phase-review.yml
name: Phase Review Gate
on:
  pull_request:
    branches: [main]
    paths:
      - 'src/**'
      - 'docs/specs/**'

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Phase Review Agent
        run: |
          # Invoke LLM with this skill + codebase context
          # Parse output for verdict
          # Fail PR if BLOCKED
```

---

## Example Invocation

```
You are the Phase Review Agent. Review Phase 1 (Nebula) implementation.

Context provided:
- CHORUM_V2_PHASE_ARCHITECTURE.md
- The_Shift.md  
- NEBULA_SCHEMA_SPEC.md
- Deployment checklist
- File tree of src/lib/nebula/
- Contents of key files

Produce a complete Phase Review Report following the skill template.
```

---

## Success Criteria

A phase review is successful when:

1. ✅ All 10 sections are completed with evidence
2. ✅ Verdict is justified by scores
3. ✅ Blocking issues are specific and actionable
4. ✅ Recommendations are concrete (not "improve testing")
5. ✅ Human can read report and know exactly what to do next
