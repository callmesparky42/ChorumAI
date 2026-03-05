# Skill: Conductor Spec Agent

> **Trigger:** Any work on feedback loops, confidence scoring, outcome tracking, or self-improvement logic
> **Purpose:** Enforce the Conductor interface contract and prevent feedback loop bugs
> **Best Model:** Opus 4.6 (reasoning about self-improvement guardrails is nuanced) | **Codex** (code generation partner — run this skill to validate Codex-generated Conductor implementations)

---

## The One Question This Skill Answers

> *Does this implementation correctly close the feedback loop while respecting guardrails?*

---

## What the Conductor Does

The Conductor is one half of the Binary Star Core. It observes outcomes and adjusts the system's understanding of what works.

```
Podium injects context → Model responds → User reacts
                                              ↓
                              Conductor observes outcome
                                              ↓
                              Conductor proposes adjustment
                                              ↓
                              Human approves (or inaction = approval)
                                              ↓
                              Confidence scores updated
                                              ↓
                              Next injection is smarter
```

---

## Interface Contract

### ConductorSignal (Input)

```typescript
interface ConductorSignal {
  type: 'explicit' | 'implicit' | 'inaction';
  learningId: string;
  conversationId: string;
  injectionId: string;  // Links to Podium's audit log entry
  signal: 'positive' | 'negative' | 'none';
  source: 'user' | 'llm_judge' | 'timeout';
  timestamp: Date;
}
```

### ConductorProposal (Output)

```typescript
interface ConductorProposal {
  id: string;
  type: 'promote' | 'demote' | 'archive' | 'merge';
  targetLearningId: string;
  proposedConfidenceDelta: number;  // Can be negative
  rationale: string;
  requiresHumanApproval: boolean;  // Always true for archive/merge
  expiresAt: Date;  // Inaction after this = implicit approval
  createdAt: Date;
}
```

### ConductorConfig

```typescript
interface ConductorConfig {
  // Confidence adjustments
  explicitPositiveDelta: number;     // Default: +0.15
  explicitNegativeDelta: number;     // Default: -0.20
  implicitPositiveDelta: number;     // Default: +0.05
  implicitNegativeDelta: number;     // Default: -0.08
  
  // Thresholds
  promotionThreshold: number;        // Default: 0.85
  archiveThreshold: number;          // Default: 0.15
  
  // Timing
  inactionApprovalDays: number;      // Default: 7
  llmJudgeEnabled: boolean;          // Default: false in 2.0, true in 2.1
  
  // Rate limiting
  maxExtractionsPerMinute: number;   // Default: 10
  turnsPerExtractionCall: number;    // Default: 3-5
  backoffBaseMs: number;             // Default: 1000
  backoffMaxMs: number;              // Default: 60000
}
```

---

## Invariants (Rules That Can NEVER Be Violated)

### What Conductor CAN Do
- ✅ Adjust confidence scores within bounds (0.0-1.0)
- ✅ Propose promotions, demotions, archives, merges
- ✅ Track injection → outcome correlations
- ✅ Queue items for human review
- ✅ Auto-apply minor confidence adjustments (< 0.1 delta)

### What Conductor CANNOT Do
- ❌ **Delete learnings without human consent** — archive only, user decides
- ❌ **Promote unverified extractions beyond threshold** — new learnings cap at 0.7 until human verification
- ❌ **Override user-pinned items** — if user sets `pinned: true`, confidence floor is 1.0
- ❌ **Auto-apply large confidence changes** — anything > 0.1 delta requires approval or inaction timeout
- ❌ **Modify learnings during injection** — read-only during Podium phase

---

## Feedback Signal Types

### 1. Explicit Signals (High Confidence)
```typescript
// User clicked thumbs up/down
{
  type: 'explicit',
  signal: 'positive' | 'negative',
  source: 'user',
  // High confidence adjustment applied
}
```

**Rules:**
- Apply adjustment immediately (no proposal needed)
- Log to audit trail
- Update `usage_count` and `last_used_at`

### 2. Heuristic Signals (Soft Priors — v2.0 stored only)
```typescript
// Turn-pattern analysis: affirmations, rephrases, session-end without correction
{
  type: 'heuristic',
  signal: 'positive' | 'negative',
  source: 'heuristic',
  // v2.0: stored in feedback table, NOT applied to confidence_base
}
```

**Rules (v2.0):**
- Record in `feedback` table with `source = 'heuristic'`
- Do NOT create a proposal; do NOT apply any delta to `confidence_base`
- These signals accumulate as a calibration dataset for v2.1
- In v2.1 only: after offline validation, bounded auto-deltas (±0.03/signal, ±0.05/session cap) may be enabled

### 3. Implicit Signals (LLM Judge — queued, opt-in only)
```typescript
// End-of-session LLM judge — fires only if user has opted in
{
  type: 'implicit',
  signal: 'positive' | 'negative',
  source: 'llm_judge',
  // Always queued as ConductorProposal, never auto-applied
}
```

**Rules:**
- Only fires if `users.endOfSessionJudgeEnabled = true` (default: false)
- Never fires for sovereign/local tier users regardless of setting
- Create proposal, don't apply directly
- Batch similar proposals (don't spam user)
- Always `requiresHumanApproval = true` — inaction timeout does NOT auto-apply these

### 4. Inaction Signals (Stored — no auto-nudge in v2.0)
```typescript
// No interaction with an injected item after 7 days
{
  type: 'inaction',
  signal: 'none',
  source: 'inaction',
  // v2.0: stored only; does NOT nudge confidence_base
}
```

**Rules (v2.0):**
- Record in `feedback` table with `source = 'inaction'`
- Do NOT apply +0.02 nudge to `confidence_base` (deferred to v2.1)
- Configurable window (default 7 days), but no automatic action taken
- Log that no action was taken

---

## Confidence Formula

```typescript
function calculateConfidenceBase(learning: Learning, signals: Signal[]): number {
  const interaction = calculateInteractionScore(signals);       // 0-1: signal frequency/strength
  const verification = learning.verified ? 1.0 : 0.5;          // Binary: human-verified?
  const consistency = calculateConsistencyScore(learning);      // 0-1: stability across signals
  const consistencyFactor = calculateConsistencyFactor(learning); // 0-1: signal-history measure
  // ⚠️  consistencyFactor is NOT the time-decay from decay.ts.
  // It measures how consistently this item has held up across multiple feedback signals.
  // confidence_base is NEVER modified by the decay tick. Only the separate `confidence`
  // column is updated by the nightly decay job. Invariant: confidence ≤ confidence_base.

  const raw = (
    interaction * 0.3 +
    verification * 0.4 +
    consistency * 0.2 +
    consistencyFactor * 0.1
  );

  // Apply bounds
  const floor = learning.pinned ? 1.0 : 0.0;
  const ceiling = learning.verified ? 1.0 : 0.7;

  return Math.max(floor, Math.min(ceiling, raw));
}
```

---

## Queue Management

### Processing States
```typescript
type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'zombie';
```

### Zombie Recovery Clause (CRITICAL)
```typescript
// Items stuck in 'processing' > 10 minutes are zombies
// Recovery runs every 5 minutes
async function recoverZombies() {
  const zombieThreshold = new Date(Date.now() - 10 * 60 * 1000);
  
  await db.update(learningQueue)
    .set({ status: 'pending', attempts: sql`attempts + 1` })
    .where(and(
      eq(learningQueue.status, 'processing'),
      lt(learningQueue.updatedAt, zombieThreshold)
    ));
}
```

**This is non-negotiable.** Serverless functions timeout. Items get stuck. Recovery must be automatic.

### Rate Limiting
```typescript
// Max turns per extraction call
const TURNS_PER_CALL = 5;  // Not monolithic blobs

// Backoff on 429
async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let delay = config.backoffBaseMs;
  
  while (true) {
    try {
      return await fn();
    } catch (e) {
      if (e.status === 429 && delay < config.backoffMaxMs) {
        await sleep(delay);
        delay *= 2;
      } else {
        throw e;
      }
    }
  }
}
```

---

## LLM-as-Judge (v2.1 Feature)

When enabled, the Conductor uses a cheap/fast model to evaluate conversation trajectories:

```typescript
interface JudgeRequest {
  conversationId: string;
  injectedLearnings: string[];      // IDs of what was injected
  conversationSummary: string;      // Compressed transcript
  outcomeSignals: string[];         // What happened after
}

interface JudgeResponse {
  verdict: 'helpful' | 'neutral' | 'unhelpful';
  confidence: number;               // 0-1, judge's confidence in verdict
  reasoning: string;                // Why this verdict
  learningScores: {
    learningId: string;
    contribution: 'positive' | 'negative' | 'none';
  }[];
}
```

**Rules:**
- Judge verdicts create `implicit` signals
- Low confidence adjustments only
- Always queued for review, never auto-applied
- Use cheapest capable model (local small model preferred)

---

## Audit Trail Requirements

Every Conductor action MUST be logged:

```typescript
interface ConductorAuditEntry {
  id: string;
  timestamp: Date;
  action: 'signal_received' | 'proposal_created' | 'adjustment_applied' | 'zombie_recovered';
  learningId?: string;
  signalType?: string;
  previousConfidence?: number;
  newConfidence?: number;
  delta?: number;
  source: string;
  rationale?: string;
}
```

---

## Compliance Checklist

Run this checklist against every Conductor implementation:

### 1. Invariant Check
```
□ Can the code delete a learning? (MUST be NO)
□ Can the code promote unverified beyond 0.7? (MUST be NO)
□ Can the code override pinned items? (MUST be NO)
□ Does large delta (>0.1) require approval? (MUST be YES)
```

### 2. Signal Handling Check
```
□ Are explicit signals (source = 'explicit') applied immediately to confidence_base?
□ Are heuristic signals stored only — NOT applied to confidence_base in v2.0?
□ Are inaction signals stored only — no automatic confidence nudge in v2.0?
□ Is end_of_session_judge disabled by default (users.endOfSessionJudgeEnabled = false)?
□ Does end_of_session_judge check the opt-in flag before firing?
□ Are LLM judge results always queued as proposals with requiresHumanApproval = true?
□ Is audit trail written for every signal?
```

### 3. Queue Check
```
□ Is zombie recovery implemented?
□ Is zombie threshold ≤ 10 minutes?
□ Is recovery scheduled to run regularly?
□ Is rate limiting implemented with backoff?
```

### 4. Feedback Loop Closure Check
```
□ Can you trace: injection → outcome → signal → adjustment?
□ Is injectionId linked between Podium and Conductor?
□ Is usage_count incremented on injection?
```

---

## Output Format

When reviewing Conductor code, return:

```markdown
## Conductor Spec Agent Verdict

**File:** `src/lib/core/conductor/processor.ts`

### Invariant Check
| Invariant | Code Behavior | Verdict |
|-----------|---------------|---------|
| No delete without consent | Uses archive only | ✅ PASS |
| Unverified cap at 0.7 | Ceiling applied | ✅ PASS |
| Pinned items protected | Floor check present | ✅ PASS |
| Large delta needs approval | Threshold check missing | ❌ FAIL |

### Queue Check
| Requirement | Present | Verdict |
|-------------|---------|---------|
| Zombie recovery | ✅ | PASS |
| Rate limiting | ✅ | PASS |
| Backoff on 429 | ❌ | FAIL |

### Overall: ❌ FAIL

**Violations:**
1. Large confidence deltas (>0.1) applied without approval check
2. Missing exponential backoff on rate limit errors

**Recommended Fix:**
```typescript
if (Math.abs(delta) > 0.1) {
  return createProposal(learning, delta);  // Don't apply directly
}
```
```

---

## v1 Anti-Patterns This Skill Prevents

| v1 Problem | What Went Wrong | Guardian Prevention |
|------------|-----------------|---------------------|
| Zombie queues | Serverless timeouts left items stuck | Mandatory recovery clause |
| Rate limit flooding | Batch import hit API limits | Chunked processing + backoff |
| usage_count never incremented | Couldn't measure learning value | Audit trail requires it |
| Feedback loop never closed | Podium and Conductor built separately | Interface contract links them |
| No audit trail | Couldn't debug injection decisions | Mandatory logging |

---

## Success Criteria

A Conductor implementation passes when:
- All invariants protected (no delete, no unverified promotion, no pinned override)
- Zombie recovery implemented and scheduled
- Rate limiting with exponential backoff
- Complete audit trail for every action
- Feedback loop traceable from injection to adjustment
- Explicit signals auto-apply; heuristic/inaction signals stored only (v2.0 policy)
- End-of-session judge is opt-in and off by default
- `consistency_factor` (not `decay_factor`) used in confidence formula

---

## Codex Partner Notes

This skill is the primary guard for Codex-generated Conductor implementations. When Codex generates `src/lib/core/conductor/` files, run this skill before merging.

**Common Codex patterns to watch for:**
- Codex may collapse all signal types into a single processing path — verify the explicit/heuristic/inaction split is preserved
- Codex may name the confidence formula component `decayFactor` (intuitive name) — must be `consistencyFactor` per spec
- Codex may enable the LLM judge by default — verify `endOfSessionJudgeEnabled` defaults to `false`
- Codex may generate synchronous confidence updates where the spec requires proposals for large deltas — verify `> 0.10` check

**To validate Codex output:** Paste the generated `signals.ts` or `confidence.ts` into the compliance checklist above. Fail on any violation before accepting the code.
