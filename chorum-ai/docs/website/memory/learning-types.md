---
title: Learning Types
description: Understanding patterns, decisions, invariants, and antipatterns in Chorum's memory.
---

# Learning Types

Chorum's memory system stores four distinct types of knowledge, each serving a different purpose. Understanding these types helps you curate your project's memory effectively.

## Why This Matters

Not all knowledge is the same. A coding convention ("use early returns") is different from a critical rule ("never expose PII"). Chorum treats them differently—invariants get priority injection, patterns build over time, decisions capture context.

---

## The Four Types

### 1. Patterns

**What they are:** Recurring approaches, coding conventions, and established ways of doing things in your project.

**How they're used:** Patterns help the AI match your project's style. When generating code, the AI references your patterns to produce consistent output.

**Examples:**
```
✓ "Use early returns to reduce nesting in handler functions"
✓ "Prefer named exports over default exports"
✓ "Use const for all variable declarations unless reassignment is needed"
✓ "Format error messages as: [Module] Error: {message}"
```

![Patterns List](/images/memory-patterns-list.png)

**When to add manually:** When you notice the AI generating code that doesn't match your style, add a pattern to correct it.

---

### 2. Decisions

**What they are:** Technical choices you've made, along with the reasoning behind them.

**How they're used:** Decisions prevent the AI from re-litigating settled choices. If you've decided to use PostgreSQL, the AI won't suggest MySQL.

**Examples:**
```
✓ "Chose PostgreSQL over SQLite for multi-user support and advanced query features"
✓ "Using Drizzle ORM instead of Prisma for better type inference and lighter bundle"
✓ "Went with Supabase Auth over rolling our own to reduce security surface area"
✓ "Selected Zod over Yup for schema validation—better TypeScript integration"
```

**Key element: The "why"**

A good decision includes rationale:
- ❌ "We use PostgreSQL" (just a fact)
- ✓ "Chose PostgreSQL over SQLite for multi-user support" (decision with context)

**When to add manually:** After significant technical discussions or architecture decisions, capture them while the reasoning is fresh.

---

### 3. Invariants

**What they are:** Rules that must **never** be violated. These are your project's hard constraints.

**How they're used:** Invariants get priority injection into context. They act as guardrails—the AI's "senior engineer interrupting you" when you're about to break a rule.

**Examples:**
```
✓ "Never use console.log in production code—use the logger service"
✓ "All API routes must include authentication middleware"
✓ "Never store secrets in environment variables without encryption"
✓ "PII must never be logged or sent to third-party services"
✓ "All database queries must use parameterized queries—no string concatenation"
```

![Invariants List](/images/memory-invariants-list.png)

**Severity levels:**

| Severity | Meaning | AI Behavior |
|----------|---------|-------------|
| `error` | Critical rule | AI should refuse to generate violating code |
| `warning` | Important guideline | AI should warn but may proceed |

**When to add manually:** After bugs caused by rule violations, security reviews, or establishing team standards.

---

### 4. Antipatterns

**What they are:** Things to explicitly avoid. The inverse of patterns.

**How they're used:** Antipatterns tell the AI what NOT to do. They're especially useful for preventing repeated mistakes.

**Examples:**
```
✓ "Don't use the `any` type in TypeScript—always be explicit"
✓ "Avoid nested ternaries—use if/else for complex conditions"
✓ "Don't use synchronous file operations in API routes"
✓ "Never catch errors without logging them"
```

**Difference from invariants:**

| Antipattern | Invariant |
|-------------|-----------|
| "Don't use any type" | "All functions must have explicit return types" |
| Style/quality preference | Hard requirement |
| AI should avoid | AI must not violate |

**When to add manually:** When you notice recurring issues in AI-generated code, or after code reviews reveal common mistakes.

---

## How Learning Types Affect Injection

When Chorum scores memory for relevance, each type gets a priority boost:

| Type | Priority Boost | Rationale |
|------|----------------|-----------|
| Invariant | +0.25 | Must not be violated—high priority |
| Pattern | +0.10 | Style consistency matters |
| Decision | +0.10 | Context prevents rehashing |
| Antipattern | +0.10 | Mistake prevention |

This means an invariant with the same semantic similarity as a pattern will rank higher and be more likely to be injected.

---

## Automatic Extraction

Chorum's pattern analyzer examines conversations and extracts learnings automatically. The extraction prompt looks for:

**Patterns extracted when you say:**
- "We always do X before Y"
- "The convention here is..."
- "In this project, we prefer..."

**Decisions extracted when you say:**
- "We chose X because..."
- "We decided to use X over Y"
- "The rationale for X is..."

**Invariants extracted when you say:**
- "Never do X"
- "Always ensure X before Y"
- "X must never be violated"

**Antipatterns extracted when you say:**
- "Don't do X"
- "Avoid X because..."
- "X is problematic because..."

All automatic extractions go to **Pending Learnings** for your approval before being added to memory.

---

## Adding Learnings Manually

1. Go to **Settings → Memory & Learning → Learned Knowledge**
2. Click **+ Add Learning Item**
3. Select the type from the dropdown
4. Enter the content
5. Optionally add context (why this learning matters)
6. Save

![Add Learning Modal](/images/memory-add-learning.png)

**Tips for good learnings:**

| Do | Don't |
|----|-------|
| Be specific to your project | Add generic programming advice |
| Include context/rationale | Just state facts without "why" |
| Keep it concise (1-2 sentences) | Write paragraphs |
| Make it actionable | Be vague or abstract |

---

## Reviewing Pending Learnings

When the analyzer or an MCP agent proposes a learning:

1. It appears in the **Pending Learnings** section
2. Review the proposed content and type
3. Choose:
   - **Approve** — Add to memory as-is
   - **Edit** — Modify before approving
   - **Deny** — Reject the proposal

The source is shown (e.g., "analyzer", "claude-code", "cursor") so you know where it came from.

---

## Related Documentation

- **[Memory Overview](./overview.md)** — How the memory system works
- **[Relevance Gating](./relevance-gating.md)** — How learnings are scored and selected
- **[Memory Management](./management.md)** — Editing and organizing your learnings
