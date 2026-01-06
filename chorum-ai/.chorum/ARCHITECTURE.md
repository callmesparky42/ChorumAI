# Chorum Agent Orchestration Architecture

## Core Philosophy: Bidirectional Intelligence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BIDIRECTIONAL FLOW                                │
│                                                                             │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │  USER   │◄───────►│    AGENT    │◄───────►│     LLM     │              │
│   │  INPUT  │         │    ROLE     │         │   PROVIDER  │              │
│   └─────────┘         └──────┬──────┘         └─────────────┘              │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────┐                                      │
│                    │ PROJECT MEMORY  │                                      │
│                    │  (Semantic)     │                                      │
│                    └─────────────────┘                                      │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────┐                                      │
│                    │ MEANING, NOT    │                                      │
│                    │ JUST TOKENS     │                                      │
│                    └─────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Three Tiers

### 1. REASONING TIER (Deep Thinking)
**When to use:** Complex analysis, architecture decisions, debugging root causes, multi-step logic

**Agents:** Analyst, Architect, Debugger, Code Reviewer

**Characteristics:**
- Low temperature (0.1-0.4) for precision
- Longer context windows utilized
- Chain-of-thought reasoning expected
- Quality over speed
- Higher cost tolerance

**Model Selection:**
```
reasoning_tier:
  primary: claude-opus-4  # Deep reasoning, nuanced understanding
  fallback: gpt-4o        # Strong reasoning, different perspective
  budget_fallback: claude-sonnet  # Good reasoning, lower cost
```

### 2. BALANCED TIER (Versatile)
**When to use:** Content creation, research, general knowledge work

**Agents:** Researcher, Writer, Editor, Copywriter, Fact Checker, Planner, Translator, Tutor

**Characteristics:**
- Medium temperature (0.3-0.7)
- Balance of speed and quality
- Good for iterative work
- Cost-conscious

**Model Selection:**
```
balanced_tier:
  primary: claude-sonnet  # Fast, capable
  fallback: gpt-4o-mini   # Cost efficient, good quality
  creative: claude-sonnet @ temp 0.8  # When creativity needed
```

### 3. FAST TIER (Speed & Efficiency)
**When to use:** Routing decisions, summarization, simple transformations

**Agents:** Summarizer, Coordinator

**Characteristics:**
- Lowest latency
- Minimal token usage
- High throughput
- Cost optimized

**Model Selection:**
```
fast_tier:
  primary: claude-haiku   # Fastest Claude
  fallback: gpt-4o-mini   # Fast, cheap
```

---

## Memory as Meaning (Not Just Context)

### The Problem with Traditional Context
```
Traditional: Dump tokens into context window → hope LLM figures it out
Result: Bloated context, missed nuance, wasted tokens
```

### The Chorum Approach
```
Chorum: Extract MEANING from memory → provide SEMANTIC FOCUS to agent
Result: Targeted context, preserved intent, efficient processing
```

### Semantic Focus Per Agent

Each agent defines a `semantic_focus` — the question they ask of memory:

| Agent | Semantic Focus |
|-------|----------------|
| Researcher | "What does this project need to know? What's already established?" |
| Analyst | "What patterns exist? What do they mean for this project?" |
| Code Reviewer | "What are this project's standards? What patterns are used?" |
| Writer | "Who is the audience? What tone fits this project?" |
| Planner | "What's the goal? What are the constraints?" |

### Implementation Pattern

```typescript
interface SemanticExtraction {
  // What the agent needs to understand
  focus: string

  // Extracted meaning (not raw text)
  understanding: {
    projectContext: string      // Distilled project essence
    relevantPatterns: string[]  // Patterns that matter for this task
    constraints: string[]       // Boundaries to respect
    priorDecisions: string[]    // Decisions that inform this work
  }

  // What was intentionally excluded
  filtered: string[]
}
```

---

## Bidirectional Flow

### Input → Agent
```
User Input
    ↓
[Task Classification]
    ↓
[Agent Selection] ←── Agent Registry (.chorum/agents/*.md)
    ↓
[Memory Query] ←── Semantic Focus determines what to extract
    ↓
[Context Assembly] = Agent Role + Semantic Memory + Task
    ↓
[LLM Invocation] ←── Tier determines model
```

### Agent → Output
```
LLM Response
    ↓
[Agent Post-Processing] ←── Output format per agent spec
    ↓
[Memory Update] ──► Decisions, patterns, learnings stored
    ↓
[User Output] ←── Formatted per agent's output spec
    ↓
[Feedback Loop] ──► Agent learns project preferences
```

### Memory → Agent → Memory (Continuous Learning)
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Project Memory ──► Agent reads semantic focus              │
│         ▲                    │                               │
│         │                    ▼                               │
│         │            Agent acts on task                      │
│         │                    │                               │
│         │                    ▼                               │
│         └──────── Agent writes learnings back                │
│                                                              │
│   Memory grows SMARTER, not just LARGER                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Agent Handoff Protocol

Agents can escalate or delegate to other agents:

```yaml
handoff_rules:
  researcher:
    escalate_to: analyst      # When interpretation needed
    delegate_to: fact_checker # When claims need verification

  analyst:
    escalate_to: architect    # When systemic design needed
    delegate_to: researcher   # When more data needed

  writer:
    escalate_to: editor       # When refinement needed
    delegate_to: fact_checker # When claims need verification

  debugger:
    escalate_to: architect    # When issue is design-level
    delegate_to: code_reviewer # When fix needs review

  coordinator:
    can_invoke: [all]         # Orchestrates any agent
    escalate_to: human        # When agents conflict
```

---

## Guardrails (Immutable)

These constraints NEVER flex, regardless of agent or task:

### Security
- Never execute untrusted code without sandboxing
- Never expose API keys or secrets in outputs
- Never bypass authentication/authorization
- Flag potential security vulnerabilities immediately

### Reasoning Integrity
- Show reasoning chain for complex decisions
- Never hide uncertainty — surface it explicitly
- Present multiple interpretations when evidence supports them
- Distinguish fact from inference

### Human Agency
- Never make irreversible decisions without human confirmation
- Always allow human override
- Log all agent actions for auditability
- Escalate to human when agents conflict or deadlock

### Memory Integrity
- Never fabricate information not in sources
- Cite sources for factual claims
- Flag when information may be outdated
- Preserve original meaning in transformations

---

## File Structure

```
.chorum/
├── ARCHITECTURE.md          # This file - system design
├── agents/
│   ├── _schema.md           # Agent definition schema
│   ├── _index.md            # Agent registry & routing rules
│   │
│   ├── # REASONING TIER
│   ├── analyst.md
│   ├── architect.md
│   ├── code-reviewer.md
│   ├── debugger.md
│   │
│   ├── # BALANCED TIER
│   ├── researcher.md
│   ├── writer.md
│   ├── editor.md
│   ├── copywriter.md
│   ├── fact-checker.md
│   ├── planner.md
│   ├── translator.md
│   ├── tutor.md
│   │
│   └── # FAST TIER
│       ├── summarizer.md
│       └── coordinator.md
│
├── memory/
│   ├── project.md           # Project-level memory
│   ├── patterns.md          # Learned patterns
│   ├── decisions.md         # Decision log
│   └── sessions/            # Per-session memory
│
└── orchestration/
    ├── routing.md           # Routing rules
    ├── workflows.md         # Multi-agent workflows
    └── guardrails.md        # Immutable constraints
```

---

## Integration with Existing Router

The existing `ChorumRouter` in `src/lib/chorum/router.ts` handles provider/model selection. The agent orchestration layer sits ABOVE this:

```
User Request
    ↓
Agent Orchestration Layer (NEW - reads .chorum/agents/)
    ↓
    ├── Selects agent based on task
    ├── Extracts semantic memory
    ├── Determines tier (reasoning/balanced/fast)
    ↓
ChorumRouter (EXISTING - src/lib/chorum/router.ts)
    ↓
    ├── Maps tier to TaskType
    ├── Selects provider within budget
    ├── Returns routing decision
    ↓
LLM Provider
```

### TaskType Mapping
```typescript
const tierToTaskType: Record<AgentTier, TaskType> = {
  reasoning: 'deep_reasoning',
  balanced: 'general',
  fast: 'bulk_processing'
}
```
