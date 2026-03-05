# Podium Interface Specification

**Phase:** 0 (pre-implementation) → implements in Phase 2a
**Status:** Locked
**Guardian:** `podium-injection-agent`

---

## Purpose

Define the complete contract for Podium — the cognitive scaffold that decides what context to inject into each LLM request. Podium reads from the Nebula (Layer 0) through `NebulaInterface` only. It writes injection audit entries. It does not write confidence scores.

## Non-Goals

- Does not implement confidence adjustment (Conductor's job)
- Does not implement feedback signal routing (Conductor's job)
- Does not define the embedding model or provider fallback (defined in NEBULA_SCHEMA_SPEC.md)
- Does not define the Shell/API surface

---

## Tiered Compilation

Context window size determines the injection tier:

| Tier | Context Window | Max Budget | Use Case |
|------|---------------|------------|----------|
| 1 | ≤ 16K tokens | 6% of window (960 max) | Haiku, Gemini Flash |
| 2 | 16K–64K tokens | 8% of window (5,120 max) | Sonnet, GPT-4o |
| 3 | > 64K tokens | 12% of window (12,288 max) | Opus, Gemini Pro |

Budget clamping: `Math.min(requestedBudget, tierConfig.maxBudget)` applied in ALL code paths including cache miss fallback.

---

## Scoring Formula

```
score = (semantic × 0.40) + (confidence × 0.25) + (typeWeight × 0.15) + (recency × 0.10) + (scopeMatch × 0.10)
```

Selection: sort by `score / tokenCount` (attention density — not raw score, not token maximization).

Quality gate: exclude items below threshold even with budget remaining.

### Type weights

Type weights are domain-aware. When `DomainSignal.primary` is null, all types use weight 1.0 (no domain boost, no domain exclusion). There is no `general` fallback type.

| Type | coding | writing | trading | null |
|------|--------|---------|---------|------|
| `invariant` | 1.0 | 1.0 | 1.0 | 1.0 |
| `anchor` | 1.0 | 1.0 | 1.0 | 1.0 |
| `pattern` | 0.9 | — | 0.9 | 1.0 |
| `decision` | 0.8 | — | 0.8 | 1.0 |
| `golden_path` | 0.7 | — | 0.7 | 1.0 |
| `antipattern` | 0.6 | — | 0.6 | 1.0 |
| `character` | — | 1.0 | — | 1.0 |
| `world_rule` | — | 1.0 | — | 1.0 |
| `plot_thread` | — | 0.9 | — | 1.0 |
| `voice` | — | 0.8 | — | 1.0 |
| `setting` | — | 0.7 | — | 1.0 |

Types not listed for a domain are weighted 0.2 (low but not zero — they can still inject if highly relevant).

### Intent weight profiles

| Intent | semantic | recency | confidence | typeWeight | scopeMatch |
|--------|---------|---------|-----------|-----------|-----------|
| `question` | 0.40 | 0.10 | 0.25 | 0.15 | 0.10 |
| `generation` | 0.40 | 0.10 | 0.25 | 0.15 | 0.10 |
| `analysis` | 0.50 | 0.05 | 0.20 | 0.15 | 0.10 |
| `debugging` | 0.30 | 0.35 | 0.15 | 0.10 | 0.10 |
| `discussion` | 0.35 | 0.10 | 0.25 | 0.15 | 0.15 |
| `continuation` | 0.30 | 0.40 | 0.15 | 0.05 | 0.10 |
| `greeting` | 0.20 | 0.10 | 0.30 | 0.20 | 0.20 |

For `debugging`: antipattern typeBoostMultiplier = 2.0, decision typeBoostMultiplier = 0.5.

---

## Decay Half-Lives

Podium reads the `confidence` column (already decayed by the nightly tick). It does not apply decay at query time — that would double-decay items.

| Type | Half-life | Floor | Notes |
|------|-----------|-------|-------|
| `invariant`, `anchor`, `character`, `world_rule` | ∞ | 1.0 | Never decay |
| `decision` | 365 days | 0.30 | Long-lived strategic choices |
| `pattern`, `voice` | 90 days | 0.15 | Behavioral; fades if unused |
| `plot_thread` | 90 days | 0.10 | Active story elements |
| `golden_path` | 30 days | 0.05 | Current best practices |
| `antipattern` | 14 days | 0.02 | Warnings fade; superseded |
| `setting` | 180 days | 0.10 | Stable but not permanent |

---

## Interface

See LAYER_CONTRACTS.md — `PodiumRequest`, `PodiumResult`, `InjectedLearning`.

---

## Invariants

1. Embeddings are pre-computed before injection. Podium never computes embeddings at query time.
2. Budget is clamped in ALL code paths: `Math.min(requested, tierConfig.maxBudget)`.
3. Quality threshold enforced: items below threshold are excluded even with budget remaining.
4. `DomainSignal.primary` is `string | null` — never the string `'general'`.
5. When `primary` is null, all types are scored with weight 1.0. No fallback domain logic.
6. Injection audit entries are written for EVERY item considered, included AND excluded.
7. Pinned items (`pinnedAt != null`) always inject if within budget. Muted items (`mutedAt != null`) never inject.
8. Selection metric is attention density (`score / tokenCount`), not raw score.

## Error Handling

- If no embedding available for query: fall back to scope + recency scoring only (no semantic component)
- If embedding table is empty: return empty injectedItems, tierUsed from context window, tokensUsed = 0
- If budget is zero after clamping: return empty context with audit entries explaining exclusion

## Testing Contract

- `getContext` with tier 1 model: verify tokensUsed ≤ 960
- `getContext` with domain null: verify no `'general'` in any type weight lookup
- `getContext` with muted learning: verify it is excluded with reason `'muted'`
- `getContext` with pinned learning: verify it is included unless over budget
- Audit log: for N candidates, audit must have exactly N entries (included + excluded)
- Budget clamping: requesting 10000 tokens on tier 1 must clamp to 960

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Cache miss path ignored tier limits | Budget clamping in all paths |
| `usageCount` not incremented on injection | Fire-and-forget UPDATE in Podium |
| No audit log for excluded items | All N candidates logged |
| Domain as binary tag (any overlap = 0.2) | Proportional scoring + null domain path |
| `'general'` as a domain fallback | `DomainSignal.primary` is `string | null` |
```

---