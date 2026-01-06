# Patterns Registry

> This file stores patterns discovered by agents during their work.
> **Bidirectional:** Agents read patterns to inform work, write new patterns when discovered.

---

## How Patterns Work

1. **Discovery:** Agent identifies a recurring pattern during task execution
2. **Recording:** Agent writes pattern here with context
3. **Application:** Future agents read relevant patterns to inform their work
4. **Evolution:** Patterns can be refined as understanding improves

---

## Pattern Schema

```yaml
pattern:
  name: string              # Short identifier
  type: code | workflow | communication | architecture | user_preference
  context: string           # When this pattern applies
  description: string       # What the pattern is
  example: string           # Concrete example
  discovered_by: string     # Which agent found it
  discovered_date: date
  confidence: high | medium | low
```

---

## Active Patterns

### Code Patterns

*No code patterns recorded yet.*

### Workflow Patterns

*No workflow patterns recorded yet.*

### Communication Patterns

*No communication patterns recorded yet.*

### Architecture Patterns

*No architecture patterns recorded yet.*

### User Preferences

*No user preference patterns recorded yet.*

---

## Deprecated Patterns

> Patterns that were once useful but no longer apply

*None yet.*

---

## Pattern Conflicts

> When patterns contradict each other, record here for human resolution

*No conflicts recorded.*

---

*This file is maintained automatically by agents.*
