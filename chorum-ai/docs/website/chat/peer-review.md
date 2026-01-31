# Phone a Friend (Peer Review)

Get a second AI to review the first AI's work. Because even AIs need fact-checkers.

---

> ⚠️ **Note:** This feature is currently under active development. The UI is in place but the API route is being refined. Check back soon!

---

## What Is It?

When Claude gives you an answer, you can ask GPT to review it. Or vice versa. A different AI model looks at the first one's work and calls out:

- **Issues** — Things that are wrong
- **Suggestions** — Things that could be better
- **Confirmations** — Things that are correct

It's like having two experts on call instead of one.

---

## How to Trigger It

### Manual Trigger
Hover over any AI response and click **"🤝 Get Second Opinion"**.

### Auto-Review (Coming Soon)
Enable in Settings to automatically review important responses.

---

## Review Focus Areas

When triggering, you can pick a focus:

| Focus | Good For |
|-------|----------|
| **Code** | Syntax, bugs, best practices |
| **Security** | Vulnerabilities, auth issues |
| **Architecture** | Design patterns, scalability |
| **Accuracy** | Factual correctness |
| **General** | Broad review, all areas |

---

## Reading the Review

Reviews appear below the original response:

```
┌────────────────────────────────────────┐
│  🤖 Claude's Response                  │
│  [Original answer here]                │
├────────────────────────────────────────┤
│  🔍 Review by GPT-4                    │
│                                        │
│  ⚠️ CRITICAL: SQL injection risk in    │
│     the query builder                  │
│                                        │
│  💡 SUGGESTION: Consider using         │
│     parameterized queries              │
│                                        │
│  ✅ CONFIRMED: Auth flow is correct    │
└────────────────────────────────────────┘
```

### Severity Levels

| Icon | Meaning |
|------|---------|
| 🔴 **Critical** | Serious problem, fix immediately |
| 🟡 **Warning** | Potential issue, worth addressing |
| 🔵 **Suggestion** | Improvement idea, not urgent |
| ✅ **Confirmed** | Reviewer agrees with this point |

---

## Cross-Provider Review

The magic: **the reviewer is always a different provider**.

| If Original Is... | Reviewer Is... |
|-------------------|----------------|
| Claude | GPT or Gemini |
| GPT | Claude or Gemini |
| Gemini | Claude or GPT |

This reduces blind spots. Different models have different training data and biases.

---

## Memory Writeback

When a review catches something useful, Chorum can save it to project memory:

1. Click **"Save Pattern"** on a review item
2. It becomes a learned pattern
3. Future responses will consider it

Example: If GPT catches that Claude forgot input validation, that pattern gets saved. Next time you ask about forms, the AI remembers.

---

## Cost

Reviews cost money — you're making an additional API call. The cost appears next to the review:

```
Review: $0.004
```

For code review and security checks, it's usually worth it.

---

## When to Use It

**Yes, use it for:**
- Production code
- Security-sensitive stuff
- Important decisions
- Anything you'll ship

**Maybe skip it for:**
- Quick questions
- Learning/exploration
- Fun conversations
- Local models (slower)

---

## Force a Reviewer

By default, Chorum picks the reviewer. But you can force one:

1. Click "Get Second Opinion"
2. Hold Shift while clicking
3. Pick your preferred reviewer

Useful if you specifically want Claude's take on GPT's code, or vice versa.

---

→ **Back to:** [Chat Overview](./overview.md)
