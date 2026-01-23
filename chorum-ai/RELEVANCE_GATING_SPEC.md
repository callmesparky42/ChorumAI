# Relevance Gating: Design Specification

> **Purpose:** Define how Chorum decides what memory to inject, when, and how much—balancing latency, accuracy, and token economics.

---

## The Problem

Chorum's value is persistent memory. But naive implementation creates two failure modes:

**Failure Mode 1: Over-injection**
- Inject all memory into every prompt
- Token costs explode ($0.50+ per message)
- Latency increases (more tokens = slower)
- Signal drowns in noise (model ignores irrelevant context)

**Failure Mode 2: Under-injection**
- Inject too little to save tokens
- Model lacks context, hallucinates
- User loses trust ("I told you this already")
- Defeats the purpose of sovereign memory

**The Goal:** Inject *exactly* the memory that makes this response better, and nothing more.

---

## User Expectation Model

Users have implicit expectations based on query type:

| Query Type | Latency Tolerance | Accuracy Need | Memory Depth |
|------------|-------------------|---------------|--------------|
| Quick question ("what's the port?") | <2s | Medium | Shallow |
| Code generation | 3-5s | High | Medium |
| Debugging / analysis | 5-10s | Very High | Deep |
| Architecture discussion | 10s+ acceptable | Critical | Full context |

**Principle:** Match memory injection depth to query complexity. Don't make simple queries slow. Don't starve complex queries of context.

---

## Architecture Overview

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
│  (shallow: 500, medium: 2K, deep: 8K)│
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

## Component 1: Query Classification

**Purpose:** Determine query complexity in <50ms to avoid adding latency.

**Classification Dimensions:**

```typescript
interface QueryClassification {
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'deep';
  intent: 'question' | 'generation' | 'analysis' | 'discussion' | 'continuation';
  domain: string[];  // e.g., ['typescript', 'auth', 'database']
  conversationDepth: number;  // messages in current thread
  hasCodeContext: boolean;
  referencesHistory: boolean;  // "as we discussed", "remember when"
}
```

**Classification Heuristics (no LLM call needed):**

| Signal | Indicates |
|--------|-----------|
| Message length < 50 chars | Likely trivial/simple |
| Contains "?" only | Question, not generation |
| Contains code blocks | Code context, needs accuracy |
| References "we", "our", "before" | History-dependent, needs memory |
| Conversation turn > 5 | Deep context already built |
| Technical jargon density | Domain-specific, needs patterns |

**Implementation:** Rule-based classifier with optional lightweight ML model (distilled, runs locally). Must complete in <50ms.

---

## Component 2: Token Budget Assignment

**Purpose:** Set a ceiling on memory injection tokens based on classification.

**Budget Tiers:**

| Complexity | Memory Budget | Typical Use Case |
|------------|---------------|------------------|
| Trivial | 0 tokens | "hi", "thanks", greetings |
| Simple | 500 tokens | Quick factual questions |
| Moderate | 2,000 tokens | Standard code generation |
| Complex | 5,000 tokens | Debugging, multi-file work |
| Deep | 8,000 tokens | Architecture, long analysis |

**Budget Modifiers:**

```typescript
function adjustBudget(base: number, context: QueryClassification): number {
  let budget = base;
  
  // Increase for history-referencing queries
  if (context.referencesHistory) budget *= 1.5;
  
  // Increase for long conversations (context already built, memory more valuable)
  if (context.conversationDepth > 10) budget *= 1.25;
  
  // Decrease if user has expressed preference for speed
  if (userPreferences.prioritizeSpeed) budget *= 0.5;
  
  // Hard ceiling: never exceed 10K tokens for memory
  return Math.min(budget, 10000);
}
```

**Rationale:** Memory injection should never exceed ~10K tokens. Beyond that, you're paying for context the model won't effectively use. The 100K+ context windows are for *user-provided* documents, not injected memory.

---

## Component 3: Relevance Scoring

**Purpose:** Score each memory item (0.0 to 1.0) for relevance to the current query.

**Memory Item Types:**

```typescript
type MemoryItem = 
  | { type: 'pattern'; content: string; domain: string[]; learnedAt: Date; usageCount: number }
  | { type: 'decision'; content: string; rationale: string; date: Date }
  | { type: 'invariant'; rule: string; severity: 'must' | 'should' | 'prefer' }
  | { type: 'preference'; key: string; value: string }
  | { type: 'fact'; content: string; source: string }
  | { type: 'conversation_summary'; content: string; date: Date; projectId: string };
```

**Scoring Formula:**

```typescript
function scoreRelevance(item: MemoryItem, query: QueryClassification, embedding: Vector): number {
  // Base: semantic similarity (0-1)
  const semanticScore = cosineSimilarity(item.embedding, query.embedding);
  
  // Recency boost (decay over 30 days)
  const daysSince = daysBetween(item.learnedAt, now());
  const recencyScore = Math.exp(-daysSince / 30);  // e^(-t/30)
  
  // Domain match boost
  const domainOverlap = intersection(item.domain, query.domain).length;
  const domainScore = domainOverlap > 0 ? 0.2 : 0;
  
  // Usage frequency boost (patterns that get used are more valuable)
  const usageScore = Math.min(item.usageCount / 10, 0.15);  // cap at 0.15
  
  // Type-based priority boost
  const typeBoost = {
    'invariant': 0.25,    // Invariants are high-priority (prevent mistakes)
    'pattern': 0.1,
    'decision': 0.1,
    'preference': 0.05,
    'fact': 0.05,
    'conversation_summary': 0.0
  }[item.type];
  
  // Weighted combination
  return (
    semanticScore * 0.5 +
    recencyScore * 0.15 +
    domainScore * 0.15 +
    usageScore +
    typeBoost
  );
}
```

**Key Insight:** Invariants get a significant boost because they prevent mistakes. A relevant invariant should almost always be injected—it's the "senior engineer interrupting you" behavior.

---

## Component 4: Memory Selection

**Purpose:** Select memory items to fill the token budget, highest relevance first.

**Algorithm:**

```typescript
function selectMemory(
  items: ScoredMemoryItem[], 
  budget: number
): MemoryItem[] {
  // Sort by relevance score descending
  const sorted = items.sort((a, b) => b.score - a.score);
  
  const selected: MemoryItem[] = [];
  let tokensUsed = 0;
  
  for (const item of sorted) {
    const itemTokens = estimateTokens(item.content);
    
    // Stop if we'd exceed budget
    if (tokensUsed + itemTokens > budget) {
      // But always include invariants if they score > 0.7
      if (item.type === 'invariant' && item.score > 0.7) {
        selected.push(item);
        tokensUsed += itemTokens;
      }
      continue;
    }
    
    // Skip items below relevance threshold (noise reduction)
    if (item.score < 0.3) break;  // Sorted, so all remaining are also < 0.3
    
    selected.push(item);
    tokensUsed += itemTokens;
  }
  
  return selected;
}
```

**Threshold Justification:** Items scoring below 0.3 are likely noise. Better to inject nothing than inject irrelevant context that confuses the model.

---

## Component 5: Context Assembly

**Purpose:** Format selected memory for injection. Structure matters.

**Injection Format:**

```markdown
<chorum_context>
## Active Invariants
- Always use Zod for runtime validation (learned: Jan 15)
- Never store secrets in environment variables without encryption (invariant)

## Relevant Patterns
- This project uses the repository pattern for data access
- Error handling follows the Result<T, E> pattern, not try/catch

## Recent Decisions
- Chose PostgreSQL over SQLite for multi-user support (Jan 20)

## Project Facts
- Tech stack: Next.js 16, TypeScript, Drizzle ORM
- User's role: Senior developer, prefers explicit typing
</chorum_context>
```

**Why Structured:**
- Clear sections help model parse relevance
- Labeled dates help model weight recency
- Explicit "invariant" markers signal importance
- Consistent format allows model to learn the pattern

---

## Latency Budget

**Target Total Overhead:** <200ms for simple queries, <500ms for complex

| Component | Target Latency | Notes |
|-----------|----------------|-------|
| Query Classification | <50ms | Local rules, no LLM |
| Embedding Generation | <100ms | Local model or cached |
| Relevance Scoring | <50ms | In-memory operations |
| Memory Selection | <10ms | Simple sort + filter |
| Context Assembly | <10ms | String formatting |
| **Total** | **<220ms** | Acceptable overhead |

**Optimization Strategies:**

1. **Pre-compute embeddings** — Don't embed at query time. Embed when memory is written.

2. **Cache recent queries** — If user asks similar questions, reuse relevance scores.

3. **Tiered storage** — Keep hot memory (last 7 days, high-use items) in RAM. Cold storage on disk.

4. **Skip for trivial** — If classification is "trivial," skip the entire pipeline. Inject nothing.

---

## Accuracy Considerations

**How Relevance Gating Reduces Hallucination:**

1. **Grounding** — Relevant facts anchor the model to reality. "The database is PostgreSQL" prevents the model from guessing MySQL syntax.

2. **Constraint Injection** — Invariants act as guardrails. "Never use `any` in TypeScript" prevents the model from taking shortcuts.

3. **Decision Context** — Injecting "we chose X because Y" prevents the model from re-litigating settled decisions.

4. **Noise Reduction** — By filtering irrelevant memory, we avoid confusing the model with unrelated context that could lead it astray.

**When to Favor Accuracy Over Latency:**

```typescript
function shouldPrioritizeAccuracy(query: QueryClassification): boolean {
  return (
    query.complexity === 'complex' || 
    query.complexity === 'deep' ||
    query.intent === 'analysis' ||
    query.hasCodeContext ||
    query.conversationDepth > 10
  );
}
```

When accuracy is prioritized:
- Increase token budget by 50%
- Lower relevance threshold to 0.2 (include more context)
- Add latency budget (+200ms acceptable)

---

## Edge Cases

**Cold Start (No Memory Yet)**
- Skip relevance gating entirely
- Inject only project-level instructions
- Memory builds over time

**Memory Overload (1000+ items)**
- Pre-filter by domain before scoring
- Index by domain tags for O(1) lookup
- Consider pruning low-value items monthly

**Conflicting Memory**
- If two patterns contradict, inject both with dates
- Let the model (or user) resolve
- Flag for user review: "Conflicting patterns detected"

**User Override**
- User can force "full context" mode (inject everything, damn the cost)
- User can force "minimal" mode (speed over accuracy)
- Expose as a toggle in UI: "Context depth: Auto / Minimal / Full"

---

## Metrics & Tuning

**Track:**

| Metric | Target | Why |
|--------|--------|-----|
| Memory injection latency | p95 < 300ms | User experience |
| Tokens injected per query | Avg < 2000 | Cost control |
| Injection relevance (user feedback) | >80% "helpful" | Quality signal |
| Invariant violation rate | Decreasing over time | Memory is working |

**Feedback Loop:**

1. After each response, optionally ask: "Was the context helpful?"
2. If user says no, flag injected items for review
3. Over time, learn which memory types are most valuable for which query types
4. Adjust scoring weights based on feedback

---

## Implementation Phases

**Phase 1: Foundation (Week 1-2)**
- Implement query classification (rule-based)
- Implement token budget assignment
- Basic relevance scoring (semantic similarity only)
- Greedy selection algorithm

**Phase 2: Refinement (Week 3-4)**
- Add recency, domain, usage scoring factors
- Implement context assembly formatting
- Add invariant priority boosting
- Latency optimization pass

**Phase 3: Learning (Week 5+)**
- Add feedback collection
- Implement scoring weight adjustment
- Add conflict detection
- User override controls in UI

---

## Open Questions

1. **Embedding Model Choice** — Local (fast, private) vs API (better quality)? Recommend: Local (e.g., `all-MiniLM-L6-v2`) for latency. Quality difference is marginal for relevance scoring.

2. **Cross-Project Memory** — Should global user patterns be scored differently than project-specific? Recommend: Yes, slight boost for global (they're proven across contexts).

3. **Conversation History Injection** — Separate from memory, or unified? Recommend: Separate. Conversation history is already in context; memory is additive knowledge.

4. **Cost Visibility** — Should users see "memory cost: 1,847 tokens" per message? Recommend: Yes, optional in UI. Transparency builds trust.

---

## Summary

Relevance gating is the economic engine of sovereign memory. Without it, Chorum either bankrupts users (over-injection) or fails to deliver value (under-injection).

**The Core Tradeoff:**
- More memory = higher accuracy, higher cost, higher latency
- Less memory = faster, cheaper, but more hallucination risk

**The Solution:**
- Classify query complexity in <50ms
- Assign token budget based on complexity
- Score all memory items by relevance
- Greedily fill budget with highest-scoring items
- Format for clean injection

**The Result:**
- Simple queries stay fast (trivial overhead)
- Complex queries get rich context (accuracy when it matters)
- Token costs stay bounded (economic sustainability)
- Users trust the system (it injects what matters, not everything)

---

*"Inject exactly the memory that makes this response better, and nothing more."*
