# Conductor Interface Specification

**Phase:** 0 (pre-implementation) → implements in Phase 2b
**Status:** Locked
**Guardian:** `conductor-spec-agent`

---

## Purpose

Define the complete contract for the Conductor — the feedback loop that observes outcomes and proposes confidence adjustments. The Conductor reads and writes to the Nebula via `NebulaInterface`. It never directly modifies the Podium's selection logic.

## Non-Goals

- Does not define injection logic (Podium's job)
- Does not define MCP feedback submission surface (see Phase 3)
- Does not define the Shell inbox UI (see Phase 5)
- Does not implement the LLM judge in v2.0 (deferred to v2.1)

---

## Signal Policy (v2.0 Canonical)

| Signal Type | Auto-applied to `confidence_base` | Stored in `feedback` |
|-------------|-----------------------------------|----------------------|
| `explicit` (👍/👎) | **Yes — immediate** | Yes |
| `heuristic` (turn-pattern) | **No — soft prior only** | Yes, `source = 'heuristic'` |
| `inaction` (7-day silence) | **No — no confidence nudge** | Yes, `source = 'inaction'` |
| `end_of_session_judge` | **No — always queued as proposal** | Yes, `source = 'llm_judge'` |

This policy is **inviolable in v2.0**. Heuristic and inaction signals accumulate as a calibration dataset for v2.1 offline experimentation. No automatic confidence drift from unverified signals.

---

## Confidence Formula

```
confidence_base = (interaction × 0.3) + (verification × 0.4) + (consistency × 0.2) + (consistencyFactor × 0.1)
```

- `interaction`: signal frequency and strength (0–1)
- `verification`: `1.0` if human-verified, `0.5` if not
- `consistency`: stability across multiple feedback signals (0–1)
- `consistencyFactor`: how consistently this item has held up across feedback history (0–1). **This is NOT the time-based decay from `computeDecayedConfidence()`.** `confidence_base` is never modified by the decay tick.

Ceiling: `1.0` if verified, `0.7` if unverified.
Floor: pinned items are untouchable — Conductor skips them entirely.
Large delta rule: any change > `0.10` to `confidence_base` requires a `ConductorProposal` with `requiresHumanApproval = true`.

---

## End-of-Session Judge (v2.0 Opt-in)

- Disabled by default: `users.endOfSessionJudgeEnabled = FALSE`
- Sovereign/local tier: never enabled regardless of user setting
- When enabled: fires asynchronously after conversation ends, sends to a provider the user has already authorized
- Results always create `conductor_proposals` with `requiresHumanApproval = true`
- Never auto-applies

---

## Guardrails (Inviolable)

1. **Cannot hard-delete a learning** — can only propose `type: 'archive'`
2. **Cannot promote unverified items beyond `confidence_base` 0.7**
3. **Cannot adjust pinned items** — Conductor checks `pinnedAt != null` and skips
4. **All actions emit a `ConductorAuditEntry`** — the audit trail is never optional
5. **Large deltas require proposals** — `|delta| > 0.10` must create a proposal, never apply directly

---

## Zombie Recovery

Queue items stuck in `processing` for > 10 minutes are zombies. Recovery runs every 5 minutes:

```typescript
// Zombie recovery pattern — must be implemented in conductor/queue.ts
async function recoverZombies(db: DB): Promise<void> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000)
  await db
    .update(conductorQueue)
    .set({ status: 'pending', lockedAt: null })
    .where(
      and(
        eq(conductorQueue.status, 'processing'),
        lt(conductorQueue.lockedAt, threshold)
      )
    )
}
```

Zombie recovery must be scheduled via:
1. Vercel Cron at `/api/cron/zombie-recovery` (primary for Vercel deployment)
2. `chorumd` internal scheduler (for local installs)

---

## Interface

See LAYER_CONTRACTS.md — `ConductorSignal`, `ConductorProposal`, `BinaryStarInterface`.

---

## Invariants

1. Explicit signals auto-apply immediately to `confidence_base`.
2. Heuristic and inaction signals are stored in `feedback` table — zero automatic `confidence_base` change.
3. LLM judge results always create proposals with `requiresHumanApproval = true`.
4. End-of-session judge checks `endOfSessionJudgeEnabled` before firing — default false.
5. Every Conductor action writes a `ConductorAuditEntry`.
6. Pinned items: Conductor skips adjustment entirely.
7. Delta > 0.10: proposal required, never direct application.
8. Unverified items: `confidence_base` ceiling = 0.7.

## Error Handling

- Signal processing failures: log and continue — one bad signal does not stop the queue
- LLM judge failures (API error, timeout): mark queue item failed, increment attempts; do not retry more than 3 times
- Zombie recovery must not throw — run silently, log count of recovered items

## Testing Contract

- Explicit positive signal: `confidence_base` increases immediately
- Heuristic signal: `confidence_base` unchanged; feedback row created with `source = 'heuristic'`
- Inaction signal: `confidence_base` unchanged; feedback row created with `source = 'inaction'`
- Delta > 0.10: proposal created, `confidence_base` unchanged until approved
- Pinned item: signal submitted → no change to any confidence column
- Zombie recovery: insert item with `status = 'processing'` and `locked_at = 15 min ago` → after recovery run, `status = 'pending'`

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| `usageCount` never incremented | Fire-and-forget UPDATE in injector |
| Zombie queue: no recovery mechanism | `recoverZombies()` on 5-min schedule |
| No feedback loop closed | Conductor observes outcome via feedback table |
| `decay_factor` in confidence formula (naming confusion) | `consistencyFactor` — not temporal decay |
| `golden_path` never extracted organically | Added to extraction prompt in Phase 2 |
```

---