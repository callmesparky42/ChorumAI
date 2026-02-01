---
title: Relevance Gating
description: How Chorum decides what memory to inject into each conversation.
---

# Relevance Gating

Relevance gating is how Chorum decides which memories to inject into each conversation—balancing context richness against speed and cost.

## Why This Matters

Without intelligent gating, you'd face two bad options:

1. **Inject everything** — Slow, expensive, and the AI ignores irrelevant noise
2. **Inject nothing** — Fast but the AI lacks context and hallucinates

Chorum injects *exactly* the memory that makes this response better, and nothing more.

---

## The Problem It Solves

| Too Much Context | Too Little Context |
|------------------|-------------------|
| Token costs explode ($0.50+ per message) | AI lacks context, makes mistakes |
| Latency increases (more tokens = slower) | You repeat yourself constantly |
| Signal drowns in noise | "I told you this already" frustration |

**The goal:** Match memory injection depth to query complexity.

---

## How It Works

```
User Message
     ↓
┌─────────────────────────────────────┐
│      Query Classification           │  ← Fast (local, <50ms)
│  (complexity, intent, domain)       │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│      Token Budget Assignment        │  ← Based on classification
│  (500 → 2K → 5K → 8K tokens)        │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│      Relevance Scoring              │  ← Embedding similarity + recency + type
│  (score each memory item 0-1)       │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│      Memory Selection               │  ← Greedy fill within budget
│  (highest relevance first)          │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│      Context Assembly               │  ← Format for injection
│  (structured, not raw dump)         │
└─────────────────────────────────────┘
     ↓
Prompt sent to LLM
```

---

## Step 1: Query Classification

Chorum classifies your query in under 50ms using local heuristics (no LLM call required).

### Complexity Levels

| Complexity | Characteristics | Example |
|------------|-----------------|---------|
| **Trivial** | Greetings, thanks, short affirmations | "hi", "thanks!" |
| **Simple** | Quick questions, single concepts | "What port does this run on?" |
| **Moderate** | Standard development tasks | "Write a function to validate email" |
| **Complex** | Debugging, multi-file work | "Why is this test failing?" |
| **Deep** | Architecture, analysis | "Review this system design" |

### Classification Signals

| Signal | What It Indicates |
|--------|-------------------|
| Message < 50 chars | Likely trivial or simple |
| Contains code blocks | Needs accuracy, likely complex |
| References "we", "our", "before" | History-dependent, needs memory |
| Conversation turn > 5 | Deep context already built |
| Technical jargon density | Domain-specific, needs patterns |

---

## Step 2: Token Budget Assignment

Each complexity level gets a memory token budget:

| Complexity | Memory Budget | Typical Use Case |
|------------|---------------|------------------|
| Trivial | 0 tokens | Skip memory entirely |
| Simple | 500 tokens | Quick factual questions |
| Moderate | 2,000 tokens | Standard code generation |
| Complex | 5,000 tokens | Debugging, multi-file work |
| Deep | 8,000 tokens | Architecture discussions |

### Budget Modifiers

The base budget is adjusted by:

- **+50%** if you reference history ("as we discussed")
- **+25%** for long conversations (turn > 10)
- **-50%** if you've enabled "prioritize speed" preference
- **Hard ceiling: 10,000 tokens** — beyond this, context becomes noise

---

## Step 3: Relevance Scoring

Every learning in your project memory is scored from 0.0 to 1.0.

### Scoring Formula

```
Final Score = 
    (Semantic Similarity × 0.50) +
    (Recency Score × 0.15) +
    (Domain Match × 0.15) +
    (Usage Frequency × 0.05) +
    (Type Boost × varies)
```

### Components

**Semantic Similarity (50%)**
How closely does this learning match the meaning of your query? Uses vector embeddings for comparison.

**Recency Score (15%)**
More recent learnings score higher. Decays exponentially over 30 days:
```
recencyScore = e^(-daysSince / 30)
```

**Domain Match (15%)**
If your query is about TypeScript and a learning is tagged "typescript", it gets a +0.15 boost.

**Usage Frequency (5%)**
Patterns that get referenced frequently are more valuable. Capped at +0.15 after 10 uses.

**Type Boost (varies)**

| Type | Boost |
|------|-------|
| Invariant | +0.25 |
| Pattern | +0.10 |
| Decision | +0.10 |
| Antipattern | +0.10 |

Invariants get the highest boost because they prevent mistakes.

---

## Step 4: Memory Selection

With scores calculated, Chorum selects memories to fill the token budget:

1. **Sort** all memories by score (highest first)
2. **Add** highest-scoring items until budget is reached
3. **Skip** items scoring below 0.30 (noise threshold)
4. **Exception:** Always include invariants scoring > 0.70, even if over budget

### The 0.30 Threshold

Items below 0.30 relevance are likely noise. Better to inject nothing than confuse the model with unrelated context.

---

## Step 5: Context Assembly

Selected memories are formatted for clean injection:

```markdown
<chorum_context>
## Active Invariants
- Always use Zod for runtime validation (learned: Jan 15)
- Never store secrets in environment variables without encryption

## Relevant Patterns
- This project uses the repository pattern for data access
- Error handling follows the Result<T, E> pattern

## Recent Decisions
- Chose PostgreSQL over SQLite for multi-user support (Jan 20)

## Project Facts
- Tech stack: Next.js, TypeScript, Drizzle ORM
</chorum_context>
```

**Why structured format:**
- Clear sections help the model parse relevance
- Labeled dates help the model weight recency
- Consistent format allows the model to learn the pattern

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Query classification | < 50ms |
| Embedding generation | < 100ms |
| Relevance scoring | < 50ms |
| Memory selection | < 10ms |
| Context assembly | < 10ms |
| **Total overhead** | **< 220ms** |

Simple queries stay fast. Complex queries get rich context.

---

## User Controls

### Context Depth Toggle

You can override automatic gating:

| Mode | Behavior |
|------|----------|
| **Auto** (default) | Chorum decides based on query complexity |
| **Minimal** | Prioritize speed, inject less |
| **Full** | Inject everything, ignore budget |

### Per-Query Override

In conversation, you can hint at depth:
- "Quick question: what's the port?" → Minimal context
- "Help me understand the full auth flow" → Deep context

---

## Why Invariants Get Priority

Invariants are special because violating them causes real problems:

- They protect against security issues
- They enforce team standards
- They prevent known bugs

A relevant invariant is like a senior engineer tapping you on the shoulder: "Hey, don't forget about this rule."

Even if an invariant would push you over the token budget, if it scores > 0.70 relevance, it gets injected anyway.

---

## Related Documentation

- **[Memory Overview](./overview.md)** — How the memory system works
- **[Learning Types](./learning-types.md)** — What each memory type means
- **[Confidence Scoring](./confidence-scoring.md)** — How project confidence affects injection
