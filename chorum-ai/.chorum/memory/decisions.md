# Decision Log

> This file records decisions made during project development.
> **Bidirectional:** Agents read to understand prior decisions, write when contributing to decisions.

---

## Decision Record Schema

```yaml
decision:
  id: string                # Unique identifier (e.g., DEC-001)
  title: string             # Short title
  date: date
  status: proposed | accepted | superseded | deprecated
  context: string           # What prompted this decision
  decision: string          # What was decided
  rationale: string         # Why this option was chosen
  alternatives: string[]    # What else was considered
  consequences: string[]    # What this means going forward
  contributors: string[]    # Agents/humans involved
```

---

## Active Decisions

### DEC-001: Markdown-Based Agent Definitions

**Date:** 2025-01-05
**Status:** Accepted

**Context:**
Need a way to define agent behaviors that is:
- Human-readable and editable
- Version-controllable
- Portable across projects

**Decision:**
Use markdown files with YAML frontmatter for agent definitions.

**Rationale:**
- Markdown is universal and tooling-friendly
- YAML allows structured data within readable format
- Git-friendly for versioning
- No special tooling required to edit

**Alternatives Considered:**
- JSON config files (less readable)
- Database storage (less portable)
- Code-defined agents (less accessible to non-developers)

**Consequences:**
- Need to parse markdown+YAML in code
- Users can hand-edit agent definitions
- Agents become part of project repository

---

### DEC-002: Three-Tier Model System (Reasoning/Balanced/Fast)

**Date:** 2025-01-05
**Status:** Accepted

**Context:**
Different tasks require different levels of LLM capability. Need systematic way to route tasks to appropriate model tier.

**Decision:**
Implement three tiers:
1. **Reasoning** — Quality-first for complex analysis (Opus, GPT-4o)
2. **Balanced** — Versatile for most tasks (Sonnet, GPT-4o-mini)
3. **Fast** — Speed-first for simple tasks (Haiku)

**Rationale:**
- Matches natural task complexity distribution
- Enables cost optimization without sacrificing quality
- Simple mental model for users and developers

**Alternatives Considered:**
- Per-task model selection (too granular)
- Two tiers only (insufficient differentiation)
- Single model (ignores cost/speed tradeoffs)

**Consequences:**
- Each agent declares its tier
- Router maps tier to available models
- Users can override tier if needed

---

### DEC-003: Semantic Focus Over Raw Context

**Date:** 2025-01-05
**Status:** Accepted

**Context:**
Agents need project context but dumping entire memory into context window is inefficient and loses signal in noise.

**Decision:**
Each agent defines a "semantic focus" — a question they ask of memory. Only relevant meaning is extracted, not raw text.

**Rationale:**
- More efficient token usage
- Preserves intent over literal content
- Forces explicit thinking about what agent needs
- Enables smarter memory compression

**Alternatives Considered:**
- Full context dump (wasteful, noisy)
- Keyword-based retrieval (misses semantic meaning)
- Fixed context per agent type (inflexible)

**Consequences:**
- Memory system must support semantic queries
- Agents must define clear semantic focus
- Memory grows "smarter" not just "larger"

---

## Proposed Decisions

*No pending proposals.*

---

## Superseded Decisions

*No superseded decisions yet.*

---

*This file is maintained by humans and agents collaboratively.*
