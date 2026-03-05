# Domain Seeds Specification

**Phase:** 0 (pre-implementation) → inserts in Phase 3
**Status:** Locked
**Guardian:** `nebula-schema-guardian`, `podium-injection-agent`

---

## Purpose

Define the initial `domain_seeds` data and the rules governing how the analyzer produces scope tags, how domain clusters emerge, and why there is no `general` fallback category.

## Non-Goals

- Does not define the LLM extraction prompt (see Phase 2 Conductor spec)
- Does not define the domain cluster recompute algorithm (Phase 3 background job)
- Does not define UI for domain management (Phase 5)

---

## Domain Design Principle

Domain is **emergent, not assigned**. Scope tags are the atomic unit:

```
scope tags (#python, #trading, #worldbuilding)
    ↓ co-occurrence over time
domain clusters (emergent, user-specific labels)
    ↓ hints from
domain seeds (system-shipped, LLM-readable defaults)
```

**The analyzer produces scope tags — never a domain label directly.**
**There is no `general` fallback.** If domain is unclear: tag with the most specific terms available. Retrieval falls back to embedding-only scoring (still correct; no domain boost).

**Accepted tradeoff:** Cold-start users with no scope tags get no domain-match bonus. Embedding similarity still returns correct results. Domain boost activates as tags accumulate.

---

## Initial Domain Seeds

Insert these rows into `domain_seeds` with `is_system = TRUE` in Phase 3:

### Coding

```json
{
  "label": "coding",
  "signal_keywords": [
    "function", "class", "import", "const", "async", "await",
    "TypeScript", "Python", "React", "Next.js", "API", "database",
    "refactor", "bug", "test", "deploy", "build", "error"
  ],
  "preferred_types": {
    "invariant": 1.0,
    "anchor": 1.0,
    "pattern": 0.9,
    "decision": 0.8,
    "golden_path": 0.7,
    "antipattern": 0.6
  },
  "is_system": true
}
```

### Writing

```json
{
  "label": "writing",
  "signal_keywords": [
    "character", "plot", "scene", "chapter", "story", "narrative",
    "protagonist", "dialogue", "world", "setting", "voice",
    "fiction", "draft", "edit", "prose"
  ],
  "preferred_types": {
    "character": 1.0,
    "world_rule": 1.0,
    "anchor": 1.0,
    "plot_thread": 0.9,
    "voice": 0.8,
    "setting": 0.7
  },
  "is_system": true
}
```

### Trading

```json
{
  "label": "trading",
  "signal_keywords": [
    "option", "strike", "expiry", "delta", "gamma", "theta",
    "position", "trade", "entry", "exit", "risk", "P&L",
    "backtesting", "strategy", "portfolio", "volatility"
  ],
  "preferred_types": {
    "invariant": 1.0,
    "anchor": 1.0,
    "decision": 0.9,
    "pattern": 0.8,
    "antipattern": 0.7,
    "golden_path": 0.6
  },
  "is_system": true
}
```

### Research

```json
{
  "label": "research",
  "signal_keywords": [
    "paper", "study", "hypothesis", "experiment", "data", "analysis",
    "citation", "methodology", "finding", "conclusion", "abstract",
    "literature", "review"
  ],
  "preferred_types": {
    "decision": 1.0,
    "invariant": 0.9,
    "pattern": 0.8,
    "golden_path": 0.7,
    "anchor": 1.0
  },
  "is_system": true
}
```

---

## How the Analyzer Produces Scope Tags

The extraction LLM prompt instructs the model to:
1. Identify the primary topics of the conversation turn
2. Produce lowercase, `#`-prefixed scope tags (e.g., `#python`, `#authentication`, `#worldbuilding`)
3. Use the most specific terms available — prefer `#react-hooks` over `#react` if the conversation is specifically about hooks
4. Produce 1–5 scope tags per extracted learning
5. Never produce `#general` as a scope tag — this is a forbidden term

Example extraction:
```
Conversation: "We decided to use Zod for validation in this Next.js API route because..."
Scope tags produced: ["#zod", "#validation", "#nextjs", "#typescript"]
Domain signal: primary = "coding" (matched against coding seed keywords)
```

---

## Domain Cluster Recompute (Phase 3 Background Job)

Clusters are NOT recomputed at conversation time. They are recomputed as a Phase 3 background job:
1. Group `learning_scopes` by user, find frequently co-occurring scope tag pairs
2. Build cluster from tags with co-occurrence count > threshold (start: 5)
3. Compute centroid by averaging embeddings of all learnings in the cluster
4. Upsert into `domain_clusters`
5. Associate projects with clusters based on scope_filter overlap

---

## Invariants

1. `domain_seeds` labels are unique — no duplicate domain names.
2. Analyzer produces scope tags, never domain labels.
3. `#general` is a forbidden scope tag — reject at validation layer.
4. `DomainSignal.primary` in Podium is the `label` from the best-matching seed, or `null`.
5. New seeds can be inserted dynamically (user-defined domains) — `is_system = FALSE`.

## Error Handling

- Inserting a duplicate `domain_seeds` label (unique constraint) should surface as a typed error
- `#general` scope tag in analyzer output must be rejected by the validation layer with a typed error
- Missing seed data at cold-start is not an error — domain scoring degrades gracefully to embedding-only
## Interface(s)

Domain seeds are stored in the `domain_seeds` table (see `NEBULA_SCHEMA_SPEC.md`).
No dedicated TypeScript interface is exposed for domain seeds in Phase 1; they are plain database rows
read via raw Drizzle queries in Phase 3 when the domain cluster recompute job runs.
## Testing Contract

- Analyzer output: extract from a coding-themed turn → scope tags include at least one coding keyword
- Analyzer output: extract from ambiguous turn → scope tags present but may not match any seed; `DomainSignal.primary = null`
- `#general` in scope tags → validation rejects it
- Domain seeds insert: 4 system seeds present after Phase 3 seed init

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Domain was a tag (string column on projects) | Domain is emergent from scope tag clustering |
| No domain-aware extraction | `domain_seeds` provide LLM hints |
| Binary domain scoring | Proportional + null domain path |
| No golden_path extraction | Added to extraction prompt in Phase 2 |
```

---