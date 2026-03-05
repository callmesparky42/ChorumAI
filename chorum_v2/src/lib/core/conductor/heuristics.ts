// src/lib/core/conductor/heuristics.ts
// Turn-pattern analysis for heuristic signal detection.
// v2.0: signals produced here are STORED ONLY — no confidence_base change.

export interface TurnContext {
  injectedLearningIds: string[]
  userMessage: string
  assistantResponse: string
  turnIndex: number
}

export interface HeuristicSignal {
  learningId: string
  signal: 'positive' | 'negative'
  strength: number
  reason: string
}

const POSITIVE_PATTERNS = [
  /\b(perfect|that('s| is) (right|correct|it)|thanks?|great|exactly|yes|worked)\b/i,
  /\b(that helps?|got it|makes sense|exactly what i needed)\b/i,
]

const NEGATIVE_PATTERNS = [
  /\b(that('s| is)n't|not quite|no|wrong|that doesn't|try again|actually)\b/i,
  /\b(i meant|let me rephrase|what i (meant|asked|wanted))\b/i,
]

export function detectHeuristicSignals(ctx: TurnContext): HeuristicSignal[] {
  const signals: HeuristicSignal[] = []
  const msg = ctx.userMessage.toLowerCase()

  const isPositive = POSITIVE_PATTERNS.some((p) => p.test(msg))
  const isNegative = NEGATIVE_PATTERNS.some((p) => p.test(msg))

  if (!isPositive && !isNegative) return signals

  for (const id of ctx.injectedLearningIds) {
    if (isPositive) {
      signals.push({ learningId: id, signal: 'positive', strength: 0.3, reason: 'user affirmation pattern' })
    } else if (isNegative) {
      signals.push({ learningId: id, signal: 'negative', strength: 0.2, reason: 'user rephrase/correction pattern' })
    }
  }

  return signals
}
