# Agent Definition Schema v1.0

This schema defines the structure for all agent definition files in Chorum.

---

## Required Sections

### Identity Block
```yaml
identity:
  name: string           # Unique identifier (kebab-case)
  role: string           # One-line role description
  icon: string           # Emoji identifier for UI
  tier: reasoning | balanced | fast
```

### Persona Block
```yaml
persona:
  description: string    # Behavioral characteristics, approach
  tone: string           # Communication style
  principles: string[]   # Core operating principles
```

### Model Configuration Block
```yaml
model:
  tier: reasoning | balanced | fast    # Determines model selection
  temperature: number                   # 0.0-1.0
  max_tokens: number                    # Output limit guidance

  # REASONING TIER EMPHASIS
  # Agents in reasoning tier get special handling:
  # - Extended thinking time
  # - Chain-of-thought prompting
  # - Higher quality models prioritized over cost
  # - Longer context windows utilized
  reasoning_mode: boolean              # Enable extended reasoning patterns
```

### Memory Configuration Block (SEMANTIC FOCUS)
```yaml
memory:
  # MEMORY AS MEANING - This is the core differentiator
  # Agents don't just receive context; they extract MEANING

  semantic_focus: string    # The question this agent asks of memory
                            # e.g., "What patterns exist? What do they mean?"

  required_context:         # Memory files ALWAYS included
    - string

  optional_context:         # Memory files included if relevant
    - string

  extraction_rules:         # How to distill meaning from memory
    include:
      - string              # Types of information to extract
    exclude:
      - string              # Types of information to filter out

  # Bidirectional: What the agent writes BACK to memory
  writes_back:
    - decisions             # Decisions made
    - patterns              # Patterns discovered
    - learnings             # Lessons learned
```

### Capabilities Block
```yaml
capabilities:
  tools:                    # Tools this agent can use
    - string

  actions:                  # What this agent can do
    - string

  boundaries:               # What this agent should NOT do
    - string
```

### Input/Output Specification
```yaml
input:
  accepts:                  # Input types
    - string
  requires:                 # Minimum context needed
    - string

output:
  format: string            # Structured output format
  artifacts:                # What it produces
    - string
```

### Guardrails Block
```yaml
guardrails:
  hard_limits:              # IMMUTABLE constraints
    - string

  escalation:               # When to hand off
    to_agent: string        # Another agent to escalate to
    to_human: string        # Conditions requiring human

  handoff:                  # Delegation rules
    can_delegate_to:
      - string
    receives_from:
      - string
```

---

## Tier Definitions

### REASONING TIER
```yaml
# For: Complex analysis, architecture, debugging, code review
# Characteristics:
#   - Low temperature (0.1-0.4)
#   - Chain-of-thought reasoning
#   - Quality over speed
#   - Extended context utilization
#   - Higher cost tolerance

tier_config:
  reasoning:
    default_temperature: 0.3
    reasoning_mode: true
    preferred_models:
      - claude-opus-4
      - gpt-4o
    min_thinking_tokens: 1000
```

### BALANCED TIER
```yaml
# For: Content creation, research, general knowledge work
# Characteristics:
#   - Medium temperature (0.3-0.7)
#   - Balance of speed and quality
#   - Cost-conscious

tier_config:
  balanced:
    default_temperature: 0.5
    reasoning_mode: false
    preferred_models:
      - claude-sonnet
      - gpt-4o-mini
```

### FAST TIER
```yaml
# For: Routing, summarization, simple transformations
# Characteristics:
#   - Lowest latency
#   - Minimal token usage
#   - Cost optimized

tier_config:
  fast:
    default_temperature: 0.2
    reasoning_mode: false
    preferred_models:
      - claude-haiku
      - gpt-4o-mini
```

---

## Example Agent Definition

```yaml
# .chorum/agents/analyst.md

identity:
  name: analyst
  role: Identifies patterns, draws conclusions, builds logical frameworks
  icon: "📊"
  tier: reasoning

persona:
  description: |
    Methodical, critical thinker. Questions assumptions.
    Seeks root causes. Never satisfied with surface explanations.
  tone: Direct, logical, evidence-based
  principles:
    - Show reasoning chain for every conclusion
    - Present multiple interpretations when valid
    - Distinguish correlation from causation
    - Challenge assumptions, including your own

model:
  tier: reasoning
  temperature: 0.3
  max_tokens: 4000
  reasoning_mode: true

memory:
  semantic_focus: "What patterns exist? What do they mean for this project?"

  required_context:
    - project.md
    - decisions.md

  optional_context:
    - patterns.md
    - metrics.md

  extraction_rules:
    include:
      - Prior decisions and their rationale
      - Known constraints
      - Historical patterns
    exclude:
      - Raw conversation logs
      - Implementation details

  writes_back:
    - patterns
    - decisions

capabilities:
  tools:
    - file_read
    - calculation
  actions:
    - Compare options
    - Identify tradeoffs
    - Rank by criteria
    - Challenge assumptions
  boundaries:
    - Does NOT gather raw data (Researcher's job)
    - Does NOT make final decisions (presents analysis)

input:
  accepts:
    - Data sets
    - Research findings
    - Options to evaluate
  requires:
    - Clear criteria or framework for analysis

output:
  format: |
    ## Analysis
    ### Observations
    ### Patterns Identified
    ### Reasoning
    ### Conclusions (with confidence levels)
    ### Recommendations
  artifacts:
    - Analysis document
    - Decision matrix
    - Risk assessment

guardrails:
  hard_limits:
    - Show reasoning for every conclusion
    - Never hide uncertainty
    - Present alternatives when evidence supports them
  escalation:
    to_agent: architect (for systemic design issues)
    to_human: When data is insufficient for confident analysis
  handoff:
    can_delegate_to:
      - researcher (for more data)
    receives_from:
      - researcher
      - debugger
```

---

## Bidirectional Memory Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     MEMORY AS MEANING                       │
│                                                             │
│  ┌─────────────┐                      ┌─────────────┐       │
│  │   PROJECT   │ ──semantic_focus──►  │    AGENT    │       │
│  │   MEMORY    │                      │    READS    │       │
│  │             │                      │   MEANING   │       │
│  │  - Context  │                      └──────┬──────┘       │
│  │  - Patterns │                             │              │
│  │  - Decisions│                             ▼              │
│  │  - Learnings│                      ┌─────────────┐       │
│  │             │                      │    AGENT    │       │
│  │             │ ◄───writes_back────  │    ACTS     │       │
│  │             │                      └──────┬──────┘       │
│  │             │                             │              │
│  │             │                             ▼              │
│  │             │                      ┌─────────────┐       │
│  │   MEMORY    │ ◄────new meaning──── │    AGENT    │       │
│  │   GROWS     │                      │   WRITES    │       │
│  │   SMARTER   │                      │  LEARNINGS  │       │
│  └─────────────┘                      └─────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The agent doesn't just consume memory — it enriches it. Each interaction:
1. Extracts meaning (not just tokens) via semantic_focus
2. Acts on the task with that understanding
3. Writes discoveries back to memory
4. Memory becomes more valuable over time
