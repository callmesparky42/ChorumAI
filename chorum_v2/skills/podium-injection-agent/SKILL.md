# Skill: Podium Injection Agent

> **Trigger:** Any work on context selection, relevance scoring, tiered compilation, or budget management
> **Purpose:** Enforce the Podium interface contract and prevent injection bugs
> **Best Model:** Gemini 3.1 (fast at scoring/ranking tasks, good at structured output) | **Codex** (code generation partner — run this skill to validate Codex-generated Podium implementations)

---

## The One Question This Skill Answers

> *Does this implementation correctly select and inject context while optimizing for attention, not just tokens?*

---

## What the Podium Does

The Podium is one half of the Binary Star Core. It decides what context to inject into each LLM request.

```
Query arrives → Podium scores learnings
                      ↓
              Podium selects by relevance + budget
                      ↓
              Podium compiles into tiered format
                      ↓
              Context injected into prompt
                      ↓
              Audit trail logged
```

---

## Interface Contract

### PodiumRequest (Input)

```typescript
interface PodiumRequest {
  userId: string;
  conversationId: string;
  queryText: string;
  queryEmbedding: number[];         // Pre-computed by caller
  scopeFilter: ScopeFilter;
  domainSignal: DomainSignal;
  intent: QueryIntent;
  budgetConfig: BudgetConfig;
  contextWindowSize: number;        // Model's context window
}

interface ScopeFilter {
  include: string[];                // Required scopes (AND)
  exclude: string[];                // Forbidden scopes
  boost: string[];                  // Optional scopes (bonus score)
}

interface DomainSignal {
  primary: 'coding' | 'writing' | 'research' | 'trading' | null;
  // ⚠️ null means domain is unclear — NOT 'general'. There is no general fallback domain.
  // When primary is null, Podium falls back to embedding-only scoring (no domain boost).
  // Scope tags still filter; semantic similarity still works. Retrieval degrades gracefully.
  confidence: number;               // 0-1
  detected: string[];               // All detected scope tags / cluster labels
}

interface QueryIntent {
  type: 'question' | 'task' | 'conversation' | 'creative';
  complexity: 'simple' | 'moderate' | 'complex';
}

interface BudgetConfig {
  maxTokens: number;                // Hard ceiling
  maxItems: number;                 // Item count limit
  qualityThreshold: number;         // Min relevance score (0-1)
}
```

### PodiumResult (Output)

```typescript
interface PodiumResult {
  injectedItems: InjectedLearning[];
  tierUsed: 1 | 2 | 3;
  tokensUsed: number;
  auditLog: InjectionAuditEntry[];
  compiledContext: string;          // The actual text to inject
}

interface InjectedLearning {
  id: string;
  content: string;
  type: string;
  confidence: number;
  relevanceScore: number;
  tokenCount: number;
}

interface InjectionAuditEntry {
  learningId: string;
  included: boolean;
  score: number;
  reason: string;                   // Why included
  excludeReason?: string;           // Why excluded (if not included)
}
```

---

## Tiered Compilation

Context window size determines the tier:

| Tier | Name | Context Window | Max Budget | Use Case |
|------|------|----------------|------------|----------|
| 1 | DNA Paragraph | ≤ 16K tokens | 6% of window | Claude Haiku, GPT-4o-mini |
| 2 | Field Guide | 16K - 64K tokens | 8% of window | Claude Sonnet, GPT-4o |
| 3 | Full Dossier | > 64K tokens | 12% of window | Claude Opus, Gemini Pro |

### Tier Selection Logic

```typescript
function selectTier(contextWindowSize: number): Tier {
  if (contextWindowSize <= 16_000) return 1;
  if (contextWindowSize <= 64_000) return 2;
  return 3;
}

function calculateBudget(tier: Tier, windowSize: number): number {
  const percentages = { 1: 0.06, 2: 0.08, 3: 0.12 };
  return Math.floor(windowSize * percentages[tier]);
}
```

### Budget Clamping (CRITICAL)

```typescript
// v1 BUG: Cache miss fallback ignored tier limits
// FIX: Always clamp to tier budget
const effectiveBudget = Math.min(
  budgetConfig.maxTokens,
  calculateBudget(tier, contextWindowSize)
);
```

---

## Attention Economy (Not Token Economy)

The primary optimization is **signal-to-noise ratio**, not token count.

### What This Means

```typescript
// ❌ WRONG: Maximize items within budget
const items = selectUntilBudgetFull(candidates, budget);

// ✅ RIGHT: Maximize relevance density
const items = selectByRelevanceDensity(candidates, budget, qualityThreshold);
```

### Relevance Density Formula

```typescript
function relevanceDensity(item: Learning): number {
  return item.relevanceScore / item.tokenCount;
}

// High relevance, low tokens = high density = preferred
// Low relevance, high tokens = low density = deprioritized
```

### Quality Threshold

Items below `qualityThreshold` are excluded even if budget remains:

```typescript
const candidates = allLearnings.filter(l => 
  l.relevanceScore >= budgetConfig.qualityThreshold
);
```

---

## Relevance Scoring

### Score Components

```typescript
function calculateRelevance(
  learning: Learning,
  query: PodiumRequest
): number {
  const semantic = cosineSimilarity(learning.embedding, query.queryEmbedding);
  const recency = calculateRecencyBoost(learning.lastUsedAt);
  const confidence = learning.confidence;
  const scopeMatch = calculateScopeBoost(learning, query.scopeFilter);
  const typeWeight = getTypeWeight(learning.type, query.domainSignal);
  
  return (
    semantic * 0.4 +
    confidence * 0.25 +
    typeWeight * 0.15 +
    recency * 0.1 +
    scopeMatch * 0.1
  );
}
```

### Type Weights by Domain

```typescript
const TYPE_WEIGHTS: Record<Domain, Record<LearningType, number>> = {
  coding: {
    invariant: 1.0,
    pattern: 0.9,
    decision: 0.8,
    golden_path: 0.7,
    antipattern: 0.6,
    anchor: 1.0,
  },
  writing: {
    character: 1.0,
    world_rule: 1.0,
    plot_thread: 0.9,
    voice: 0.8,
    setting: 0.7,
    anchor: 1.0,
  },
  // ... other domains
};
```

---

## Decay Curves

Different learning types decay at different rates:

| Type | Half-Life | Floor | Notes |
|------|-----------|-------|-------|
| `anchor` | ∞ (never) | 1.0 | Identity facts, proper nouns |
| `invariant` | ∞ (never) | 0.8 | Rules that never change |
| `character` | ∞ (never) | 0.9 | For writing domain |
| `world_rule` | ∞ (never) | 0.9 | For writing domain |
| `decision` | 365 days | 0.3 | Strategic choices |
| `pattern` | 90 days | 0.2 | Behavioral patterns |
| `plot_thread` | 90 days | 0.4 | Active story elements |
| `golden_path` | 30 days | 0.1 | Current best practices |
| `antipattern` | 14 days | 0.1 | Things to avoid |

### Decay Formula

```typescript
function calculateDecay(learning: Learning, now: Date): number {
  const config = DECAY_CONFIG[learning.type];
  
  if (config.halfLifeDays === null) {
    return config.floor;  // Never decays
  }
  
  const ageMs = now.getTime() - learning.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLives = ageDays / config.halfLifeDays;
  const decayFactor = Math.pow(0.5, halfLives);
  
  return Math.max(config.floor, decayFactor);
}
```

---

## Domain-Aware Injection

When `domainSignal.primary` is detected, use domain-specific types:

### Coding Domain
```typescript
const CODING_TYPES = ['invariant', 'pattern', 'decision', 'golden_path', 'antipattern', 'anchor'];
const CODING_HEADERS = {
  invariant: '## Project Rules',
  pattern: '## Patterns',
  decision: '## Decisions Made',
  // ...
};
```

### Writing Domain
```typescript
const WRITING_TYPES = ['character', 'setting', 'plot_thread', 'voice', 'world_rule', 'anchor'];
const WRITING_HEADERS = {
  character: '## Characters',
  plot_thread: '## Active Plot Threads',
  world_rule: '## World Rules',
  // ...
};
```

### Type Selection Logic

```typescript
function getRelevantTypes(domain: DomainSignal['primary']): string[] | null {
  // Returns null when domain is unknown — Podium then uses ALL types for scoring
  // (no domain filter, no type boost multiplier). Semantic similarity carries the full load.
  switch (domain) {
    case 'writing': return WRITING_TYPES;
    case 'coding': return CODING_TYPES;
    case 'research': return RESEARCH_TYPES;
    case 'trading': return TRADING_TYPES;
    case null: return null;  // No general fallback — score all types, no domain boost
  }
}
// ❌ FORBIDDEN: default: return GENERAL_TYPES
// There is no general bucket. Unknown domain = no domain signal, not a different category.
```

---

## Embedding Requirements

### Pre-Computation (CRITICAL)

```typescript
// ❌ WRONG: Compute embedding on first query (latency)
const embedding = await computeEmbedding(learning.content);

// ✅ RIGHT: Embedding computed at insert time
// Learning MUST have embedding before it's queryable
async function createLearning(content: string, ...): Promise<Learning> {
  const embedding = await computeEmbedding(content);
  return db.insert(learnings).values({ content, embedding, ... });
}
```

### Embedding Provider Fallback

```typescript
// v2 embedding architecture: two typed tables, two dimension spaces.
// Podium queries the best available table per user context:
const EMBEDDING_PROVIDERS = [
  { name: 'openai',  model: 'text-embedding-3-small',  dimensions: 1536, table: 'embeddings_1536' },
  { name: 'google',  model: 'text-embedding-004',       dimensions: 1536, table: 'embeddings_1536' },
  { name: 'mistral', model: 'mistral-embed',            dimensions: 1024, table: 'embeddings_1536' }, // stored in 1536 table if normalized
  { name: 'local',   model: 'all-MiniLM-L6-v2',         dimensions: 384,  table: 'embeddings_384'  },
];
// Query priority: embeddings_1536 first → embeddings_384 if 1536 empty → scope/recency only if neither.
// DO NOT query both tables and blend scores — use the highest-quality available table for the user.
// Score normalization across tables is not implemented in v2.0.

async function computeEmbedding(text: string): Promise<number[]> {
  for (const provider of EMBEDDING_PROVIDERS) {
    try {
      return await embed(text, provider);
    } catch (e) {
      console.warn(`Embedding provider ${provider.name} failed, trying next`);
    }
  }
  throw new Error('All embedding providers failed');
}
```

---

## Audit Trail Requirements

Every injection decision MUST be logged:

```typescript
// For EVERY learning considered (not just included)
const auditEntry: InjectionAuditEntry = {
  learningId: learning.id,
  included: score >= threshold && withinBudget,
  score: score,
  reason: included ? `Score ${score} above threshold ${threshold}` : undefined,
  excludeReason: !included ? determineExcludeReason(learning, score, budget) : undefined,
};
```

### Exclude Reasons

```typescript
function determineExcludeReason(
  learning: Learning,
  score: number,
  remainingBudget: number
): string {
  if (score < qualityThreshold) {
    return `Score ${score} below quality threshold ${qualityThreshold}`;
  }
  if (learning.tokenCount > remainingBudget) {
    return `Token count ${learning.tokenCount} exceeds remaining budget ${remainingBudget}`;
  }
  if (!scopeMatches(learning)) {
    return `Scope mismatch: learning has ${learning.scopes}, query requires ${requiredScopes}`;
  }
  return 'Unknown';
}
```

---

## Compliance Checklist

Run this checklist against every Podium implementation:

### 1. Tiering Check
```
□ Is tier selection based on context window size?
□ Are budget percentages correct (6%, 8%, 12%)?
□ Is budget clamping applied on cache miss?
```

### 2. Attention Economy Check
```
□ Is relevance density calculated (score / tokens)?
□ Is quality threshold enforced?
□ Are low-relevance items excluded even with budget remaining?
```

### 3. Domain Awareness Check
```
□ When domain is detected: are domain-specific types used?
□ When domain is null: does Podium score ALL types (no general fallback category)?
□ Is DomainSignal.primary typed as union | null (no 'general' string)?
□ Is there NO switch default returning GENERAL_TYPES?
□ Are type weights domain-aware?
□ Is domain signal passed through to type selection?
```

### 4. Embedding Check
```
□ Are embeddings pre-computed at insert time?
□ Is there a fallback chain for embedding providers?
□ Is embedding non-nullable in the schema?
```

### 5. Audit Trail Check
```
□ Is every considered learning logged (not just included)?
□ Does audit entry include score AND reason?
□ Does excluded entry include exclude reason?
```

---

## Output Format

When reviewing Podium code, return:

```markdown
## Podium Injection Agent Verdict

**File:** `src/lib/core/podium/selector.ts`

### Tiering Check
| Requirement | Present | Verdict |
|-------------|---------|---------|
| Tier by window size | ✅ | PASS |
| Budget percentages | ✅ | PASS |
| Budget clamping | ❌ | FAIL |

### Attention Economy Check
| Requirement | Present | Verdict |
|-------------|---------|---------|
| Relevance density | ✅ | PASS |
| Quality threshold | ✅ | PASS |

### Domain Awareness Check
| Requirement | Present | Verdict |
|-------------|---------|---------|
| Domain-specific types | ❌ | FAIL |
| Domain type weights | ❌ | FAIL |

### Overall: ❌ FAIL

**Violations:**
1. Budget clamping not applied on cache miss fallback
2. Domain signal not used for type selection

**Recommended Fix:**
```typescript
// Add budget clamping
const budget = Math.min(config.maxTokens, tierBudget);

// Add domain-aware type selection
const types = getRelevantTypes(domainSignal.primary);
const candidates = learnings.filter(l => types.includes(l.type));
```
```

---

## v1 Anti-Patterns This Skill Prevents

| v1 Problem | What Went Wrong | Guardian Prevention |
|------------|-----------------|---------------------|
| Budget overflow on cache miss | Fallback path ignored tier limits | Budget clamping required |
| Domain was a tag, not a profile | Writing projects used coding types | Domain-aware type selection |
| Deferred embeddings | First query was slow | Pre-computation required |
| No audit trail | Couldn't debug "why wasn't X injected?" | Mandatory logging |
| Token-first optimization | Stuffed context with low-relevance items | Attention economy principle |

---

## Success Criteria

A Podium implementation passes when:
- Tiering correctly selects by context window
- Budget clamping applied in all code paths
- Relevance density prioritized over token count
- Domain-specific types used when domain detected; all types scored when domain is null
- No `'general'` domain string anywhere in the codebase
- Embeddings queried from `embeddings_1536` or `embeddings_384` typed tables (not a column on `learnings`)
- Embedding tables queried in priority order (1536 first, 384 fallback, no score blending)
- Complete audit trail for every decision

---

## Codex Partner Notes

This skill validates Codex-generated Podium scoring and selection logic. Run before merging any `src/lib/core/podium/` files.

**Common Codex patterns to watch for:**
- Codex often adds a `'general'` case to domain switches — must be removed; use `null` and score all types
- Codex may generate `learning.embedding` direct access — must use `embeddings_1536` / `embeddings_384` join
- Codex may blend embedding scores from both tables — v2.0 uses sequential fallback, not blending
- Codex may sort by raw relevance score instead of `score / tokenCount` (attention density) — verify the density formula
- Codex may include items below the quality threshold if budget remains — verify the threshold enforcement
