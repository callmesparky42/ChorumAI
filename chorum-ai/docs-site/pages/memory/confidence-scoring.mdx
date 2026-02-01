---
title: Confidence Scoring
description: How Chorum measures its understanding of your projects over time.
---

# Confidence Scoring

Each project in Chorum has a confidence score (0-100) that reflects how well the system "knows" that project. Higher confidence means more effective memory injection.

## Why This Matters

A brand-new project has no history—Chorum doesn't know your patterns, decisions, or constraints. Over time, as you work and build up learnings, confidence grows and the AI becomes more helpful.

Confidence also decays. If you don't use a project for months, that knowledge becomes less reliable.

---

## How Confidence is Calculated

Confidence is built from three factors:

### 1. Interaction Count

More interactions = more data = higher confidence.

| Interactions | Contribution |
|--------------|--------------|
| 0-10 | Low baseline |
| 10-50 | Building confidence |
| 50-100 | Solid foundation |
| 100+ | Strong confidence |

But interactions alone aren't enough—variety matters too.

### 2. Interaction Diversity

A project where you've asked about authentication, database design, error handling, and UI patterns has more diverse knowledge than one where you've only discussed database queries.

Diversity is measured by:
- Number of distinct topics covered
- Variety of learning types (patterns, decisions, invariants)
- Range of file/module areas touched

### 3. Time Decay

Confidence decays logarithmically over time. A project you haven't touched in 6 months is less reliable than one you used yesterday.

```
decayedConfidence = baseConfidence × log(2) / log(daysSinceLastUse + 1)
```

This decay is gentle—a week away barely affects confidence, but months of inactivity will lower it.

---

## Confidence Levels

| Score | Level | What It Means |
|-------|-------|---------------|
| 0-20 | Low | New or rarely used project |
| 21-40 | Building | Some history, still learning |
| 41-60 | Moderate | Solid base of knowledge |
| 61-80 | High | Well-established patterns |
| 81-100 | Very High | Deep, reliable knowledge |

---

## How Confidence Affects Memory Injection

Higher confidence leads to:

### More Aggressive Injection

At high confidence, Chorum is more willing to inject relevant memories because it trusts they're accurate and useful.

### Lower Relevance Thresholds

| Confidence | Relevance Threshold |
|------------|---------------------|
| Low (< 30) | 0.40 (cautious) |
| Moderate (30-60) | 0.30 (default) |
| High (> 60) | 0.25 (generous) |

At higher confidence, lower-scoring memories might still be injected because Chorum trusts its knowledge base.

### Increased Token Budgets

High-confidence projects may get slightly larger memory budgets because the knowledge is more reliable.

---

## Building Confidence

Confidence grows through:

1. **Regular use** — Interact with your project frequently
2. **Diverse queries** — Ask about different aspects of your project
3. **Adding learnings** — Manually add patterns and decisions
4. **Approving proposals** — Review and approve extracted learnings
5. **Using MCP** — External agents querying memory also builds confidence

### Quick Confidence Boost

If you're starting a new project and want to quickly build confidence:

1. Add 5-10 core patterns manually
2. Add 2-3 key decisions with rationale
3. Add 1-2 critical invariants
4. Have a few conversations covering different areas

This gives Chorum a foundation to work from immediately.

---

## Viewing Confidence

You can see your project's confidence in the Memory Dashboard:

![Memory Dashboard](/images/memory-dashboard.png)

The dashboard shows:
- Current confidence score
- Decay rate (if any)
- Interaction count
- Number of learnings by type

---

## Resetting Confidence

If your project has changed significantly (major refactor, new tech stack), you might want to reset confidence:

1. Go to **Settings → Memory & Learning → Learned Knowledge**
2. Review and delete outdated learnings
3. Add new learnings reflecting current state
4. Confidence will naturally reset as old decay compounds

There's no "reset confidence" button—instead, prune outdated knowledge and add fresh learnings.

---

## Cross-Project Confidence

Currently, each project has independent confidence. Future versions may include:

- **Global user patterns** — Patterns that apply across all your projects
- **Cross-project boosting** — High confidence in one project partially transfers to similar projects

---

## FAQ

### Why is my confidence low even though I have many learnings?

Possible reasons:
- **Stale learnings** — Old, unused learnings don't boost confidence much
- **Low diversity** — All learnings are in one area
- **Inactivity** — Time decay has lowered the score

### Can confidence go down?

Yes, through:
- **Time decay** — Inactivity reduces confidence
- **Deleted learnings** — Removing knowledge lowers confidence
- **Denied proposals** — Rejected learnings don't contribute

### Does confidence affect MCP queries?

Yes. When external agents query via MCP, confidence affects how aggressively memory is returned. Low-confidence projects may return fewer items.

---

## Related Documentation

- **[Memory Overview](./overview.md)** — How the memory system works
- **[Relevance Gating](./relevance-gating.md)** — How memories are scored and selected
- **[Memory Management](./management.md)** — Viewing and editing your learnings
