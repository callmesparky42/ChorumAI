# Routing Configuration

## Tier-Based Model Selection

```yaml
# Mapping agent tiers to LLM selection
tier_routing:
  reasoning:
    # QUALITY FIRST - These agents need deep thinking
    priority: quality
    models:
      primary: claude-opus-4       # Best reasoning
      fallback_1: gpt-4o           # Strong alternative
      fallback_2: claude-sonnet    # Budget reasoning
    settings:
      min_thinking_time: true      # Allow extended generation
      temperature_cap: 0.4         # Precision over creativity
      context_priority: high       # Use full context window

  balanced:
    # VERSATILE - Good enough quality, reasonable speed
    priority: balance
    models:
      primary: claude-sonnet
      fallback_1: gpt-4o-mini
      fallback_2: claude-haiku
    settings:
      min_thinking_time: false
      temperature_cap: 0.8
      context_priority: medium

  fast:
    # SPEED FIRST - Quick responses, minimal cost
    priority: speed
    models:
      primary: claude-haiku
      fallback_1: gpt-4o-mini
    settings:
      min_thinking_time: false
      temperature_cap: 0.3
      context_priority: low
```

---

## Task-to-Agent Routing

### Pattern Matching

```yaml
# Keywords/patterns → Agent selection
task_patterns:
  # REASONING TIER (quality-critical)
  analysis:
    patterns: ["analyze", "evaluate", "compare", "assess", "diagnose", "investigate"]
    agent: analyst
    tier: reasoning

  architecture:
    patterns: ["design system", "architect", "structure", "schema", "api design"]
    agent: architect
    tier: reasoning

  code_review:
    patterns: ["review code", "check code", "code quality", "security review", "pr review"]
    agent: code-reviewer
    tier: reasoning

  debugging:
    patterns: ["debug", "fix bug", "troubleshoot", "error", "broken", "not working"]
    agent: debugger
    tier: reasoning

  # BALANCED TIER (versatile)
  research:
    patterns: ["research", "find", "search", "look up", "what is", "learn about"]
    agent: researcher
    tier: balanced

  writing:
    patterns: ["write", "draft", "compose", "create content", "blog post", "documentation"]
    agent: writer
    tier: balanced

  editing:
    patterns: ["edit", "revise", "improve", "refine", "polish", "proofread"]
    agent: editor
    tier: balanced

  copywriting:
    patterns: ["marketing", "copy", "headline", "cta", "ad", "landing page", "email campaign"]
    agent: copywriter
    tier: balanced

  fact_checking:
    patterns: ["verify", "fact check", "validate", "is it true", "confirm"]
    agent: fact-checker
    tier: balanced

  planning:
    patterns: ["plan", "break down", "task list", "roadmap", "steps to", "how to approach"]
    agent: planner
    tier: balanced

  translation:
    patterns: ["translate", "convert", "localize", "in spanish", "for beginners", "simplify"]
    agent: translator
    tier: balanced

  teaching:
    patterns: ["explain", "teach", "help understand", "learn", "tutorial", "how does"]
    agent: tutor
    tier: balanced

  # FAST TIER (efficiency-critical)
  summarization:
    patterns: ["summarize", "tldr", "condense", "brief", "key points", "recap"]
    agent: summarizer
    tier: fast

  coordination:
    patterns: ["coordinate", "orchestrate", "manage", "workflow", "multiple steps"]
    agent: coordinator
    tier: fast
```

---

## Complexity Assessment

```yaml
complexity_routing:
  # Route based on task complexity

  simple:
    indicators:
      - Single-step task
      - Clear input/output
      - No ambiguity
      - No dependencies
    prefer_tier: fast
    examples:
      - "Summarize this paragraph"
      - "Translate to Spanish"

  moderate:
    indicators:
      - Multi-step task
      - Some ambiguity
      - Limited dependencies
      - Standard patterns
    prefer_tier: balanced
    examples:
      - "Write a blog post about X"
      - "Plan the implementation of Y"

  complex:
    indicators:
      - Deep analysis required
      - Multiple dependencies
      - High ambiguity
      - Custom reasoning needed
    prefer_tier: reasoning
    examples:
      - "Debug this intermittent issue"
      - "Design the authentication system"
      - "Review this PR for security"
```

---

## Budget-Aware Routing

```yaml
budget_routing:
  # Fallback logic when budget constrained

  strategy: graceful_degradation

  rules:
    - if: reasoning_tier_exhausted
      then: use_balanced_with_warning
      warning: "Using balanced model. Complex analysis may be limited."

    - if: balanced_tier_exhausted
      then: use_fast_with_warning
      warning: "Using fast model. Quality may be reduced."

    - if: all_tiers_exhausted
      then: queue_or_reject
      message: "Daily budget exhausted. Task queued for tomorrow or upgrade required."

  cost_awareness:
    show_cost_estimate: true
    warn_on_expensive: true
    expensive_threshold: $0.10  # Warn if single request exceeds this
```

---

## Integration with ChorumRouter

```typescript
// How agent orchestration connects to existing router

interface AgentRoutingRequest {
  task: string
  userOverride?: string  // User-selected agent
  complexity?: 'simple' | 'moderate' | 'complex'
}

interface AgentRoutingDecision {
  agent: string
  tier: 'reasoning' | 'balanced' | 'fast'
  semanticFocus: string
  requiredContext: string[]
}

// Flow:
// 1. User input → Agent Orchestration (select agent, extract semantic focus)
// 2. Agent selection → Tier determination
// 3. Tier → ChorumRouter.route({ taskType: tierToTaskType[tier] })
// 4. ChorumRouter → Provider/Model selection
// 5. Build prompt = AgentRole + SemanticMemory + Task
// 6. Execute → Post-process → Write back to memory

const tierToTaskType = {
  reasoning: 'deep_reasoning',
  balanced: 'general',
  fast: 'bulk_processing'
}
```

---

## Manual Override

```yaml
override_rules:
  # User can always override automatic routing

  allowed_overrides:
    - agent_selection    # "Use the Architect for this"
    - tier_selection     # "Use reasoning tier"
    - model_selection    # "Use Claude Opus specifically"

  override_logging:
    log_all_overrides: true
    track_override_outcomes: true  # Did override improve results?

  restrictions:
    - Cannot bypass security guardrails
    - Cannot exceed budget limits
    - Cannot disable human checkpoints
```
