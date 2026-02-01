---
title: Memory Management
description: View, edit, delete, and organize your project learnings.
---

# Memory Management

Chorum's memory dashboard lets you view, edit, and organize all the patterns, decisions, and invariants your AI has learned.

## Why This Matters

Automatic learning is great, but you need control. Maybe an extracted pattern is wrong. Maybe a decision has changed. Maybe you want to add something the AI missed. The memory dashboard gives you that control.

---

## Accessing the Dashboard

1. Open **Settings** from the sidebar
2. Go to **Memory & Learning**
3. Select **Learned Knowledge**

You'll see the full memory dashboard for your current project.

![Memory Dashboard](/images/memory-dashboard.png)

---

## Dashboard Layout

### Project Selector

Switch between projects using the dropdown at the top. Each project has its own isolated memory.

### Summary Cards

Quick stats for your current project:

| Card | What It Shows |
|------|---------------|
| Invariants | Count of active rules |
| Patterns | Count of coding patterns |
| Critical Files | Key files identified |
| Confidence | Current confidence score |

### Learning Lists

Expandable sections for each learning type:
- **Invariants** — Rules that must not be broken
- **Patterns** — Coding conventions and approaches
- **Decisions** — Technical choices with rationale
- **Antipatterns** — Things to avoid

---

## Viewing Learnings

Click on any section header to expand it and see all learnings of that type.

![Invariants List](/images/memory-invariants-list.png)

Each learning shows:
- **Content** — The actual learning text
- **Context** — Why this was learned (if provided)
- **Source** — Where it came from (analyzer, claude-code, manual, etc.)
- **Date** — When it was added
- **Actions** — Edit and delete buttons

---

## Adding a Learning

### Manual Addition

1. Click **+ Add Learning Item**
2. A modal appears with:
   - **Type selector** — Choose Pattern, Decision, Invariant, or Antipattern
   - **Content** — The learning itself
   - **Context** — Optional: why this matters
3. Click **Save**

![Add Learning Modal](/images/memory-add-learning.png)

### Tips for Good Learnings

| Do | Don't |
|----|-------|
| Be specific to your project | Add generic advice |
| Include the "why" | Just state facts |
| Keep it actionable | Be vague |
| One concept per learning | Pack multiple ideas |

**Good examples:**
```
✓ "Use early returns to reduce nesting—maintain 2-level max indent"
✓ "Chose PostgreSQL over SQLite for multi-user support and better indexing"
✓ "Never log user emails or PII to console—use redacted placeholders"
```

**Bad examples:**
```
✗ "Write good code" (too vague)
✗ "TypeScript is better than JavaScript" (not actionable)
✗ "Use functions" (too generic)
```

---

## Editing Learnings

1. Find the learning you want to edit
2. Click the **Edit** (pencil) icon
3. Modify the content or type
4. Click **Save**

Common reasons to edit:
- Fix typos or unclear wording
- Update after circumstances change
- Add missing context
- Change learning type (e.g., pattern → invariant)

---

## Deleting Learnings

1. Find the learning to delete
2. Click the **Delete** (trash) icon
3. Confirm the deletion

**When to delete:**
- Learning is outdated (you've changed approach)
- Learning was extracted incorrectly
- Learning is duplicate of another
- Project direction has changed

**Note:** Deleted learnings can't be recovered. If you're unsure, consider editing instead.

---

## Reviewing Pending Learnings

When the analyzer or an MCP agent proposes a learning, it goes to the **Pending Learnings** queue.

### The Review Flow

1. Go to **Memory & Learning → Pending Learnings**
2. You'll see all proposals waiting for review
3. For each proposal:
   - **Source** — Who proposed it (analyzer, claude-code, cursor, etc.)
   - **Type** — What kind of learning
   - **Content** — The proposed text
   - **Context** — Why it was proposed

### Actions

| Action | What It Does |
|--------|--------------|
| **Approve ✓** | Add to memory as-is |
| **Edit** | Modify before approving |
| **Deny ✗** | Reject the proposal |

### Best Practices

- Review regularly (daily if using MCP agents actively)
- Don't let the queue grow too large
- Edit proposals to be more specific if needed
- Deny duplicates or off-target proposals

---

## Bulk Operations

### Exporting Learnings

To export your project's learnings:

1. Go to **Settings → Sovereignty → Export**
2. Your learnings are included in the encrypted export

### Importing Learnings

When importing from a `.chorum` file:
1. Go to **Settings → Sovereignty → Import**
2. Learnings from the imported file merge with existing ones
3. Conflicts are flagged for resolution

→ See **[Export/Import](../sovereignty/export-import.md)** for details.

---

## Memory Health Indicators

Watch for these signs your memory needs attention:

| Indicator | What It Means | Action |
|-----------|---------------|--------|
| Confidence dropping | Inactive or stale data | Use project more, add fresh learnings |
| Many pending learnings | Review queue backed up | Review and approve/deny |
| Conflicting patterns | Contradictory learnings | Edit or delete one |
| Very old learnings | May be outdated | Review and update or delete |

---

## FAQ

### How many learnings can I have?

There's no hard limit, but practical considerations:
- **Performance** — Thousands of learnings may slow scoring
- **Relevance** — More learnings means more noise to filter
- **Quality** — Better to have 50 great learnings than 500 mediocre ones

### Can I reorder learnings?

Learnings aren't ordered—they're scored by relevance for each query. Recent, frequently-used learnings naturally score higher.

### Do deleted learnings affect confidence?

Yes, slightly. Deleting learnings removes their contribution to confidence, but the effect is small unless you delete many.

### Can I share learnings between projects?

Not directly, but you can:
1. Export project A
2. Create project B
3. Import project A's data and resolve what you want to keep

Future versions may support cross-project learning sharing.

---

## Related Documentation

- **[Memory Overview](./overview.md)** — How the memory system works
- **[Learning Types](./learning-types.md)** — Understanding each type
- **[Confidence Scoring](./confidence-scoring.md)** — How confidence works
- **[Export/Import](../sovereignty/export-import.md)** — Backing up and restoring memory
