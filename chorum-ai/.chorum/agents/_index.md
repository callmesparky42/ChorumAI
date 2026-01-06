# Agent Registry & Routing Index

## Quick Reference

| Agent | Tier | Icon | Primary Use |
|-------|------|------|-------------|
| [Analyst](#analyst) | **REASONING** | 📊 | Find patterns, draw conclusions |
| [Architect](#architect) | **REASONING** | 🏗️ | Design systems, evaluate tradeoffs |
| [Code Reviewer](#code-reviewer) | **REASONING** | 🔎 | Review code quality & security |
| [Debugger](#debugger) | **REASONING** | 🐛 | Diagnose issues, find root causes |
| [Researcher](#researcher) | BALANCED | 🔍 | Gather & validate information |
| [Writer](#writer) | BALANCED | ✍️ | Draft clear prose |
| [Editor](#editor) | BALANCED | ✂️ | Refine content |
| [Copywriter](#copywriter) | BALANCED | 📣 | Persuasive copy |
| [Fact Checker](#fact-checker) | BALANCED | ✓ | Validate claims |
| [Planner](#planner) | BALANCED | 📅 | Break down tasks |
| [Translator](#translator) | BALANCED | 🌐 | Convert languages/formats |
| [Tutor](#tutor) | BALANCED | 🎓 | Teach & explain |
| [Summarizer](#summarizer) | FAST | 📋 | Distill to essentials |
| [Coordinator](#coordinator) | FAST | 🎯 | Orchestrate workflows |

---

## Tier Distribution

### REASONING TIER (Quality-First)
```
┌────────────────────────────────────────────────────────────┐
│  REASONING TIER                                            │
│  ══════════════                                            │
│                                                            │
│  These agents get:                                         │
│  • Extended thinking time                                  │
│  • Chain-of-thought prompting                              │
│  • Highest quality models (Opus, GPT-4o)                   │
│  • Longer context windows                                  │
│  • Higher cost tolerance                                   │
│                                                            │
│  📊 Analyst     🏗️ Architect     🔎 Code Reviewer     🐛 Debugger │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### BALANCED TIER (Versatile)
```
┌────────────────────────────────────────────────────────────┐
│  BALANCED TIER                                             │
│  ═════════════                                             │
│                                                            │
│  These agents get:                                         │
│  • Good models (Sonnet, GPT-4o-mini)                       │
│  • Balance of speed and quality                            │
│  • Cost-conscious routing                                  │
│                                                            │
│  🔍 Researcher   ✍️ Writer   ✂️ Editor   📣 Copywriter      │
│  ✓ Fact Checker  📅 Planner  🌐 Translator  🎓 Tutor       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### FAST TIER (Speed-First)
```
┌────────────────────────────────────────────────────────────┐
│  FAST TIER                                                 │
│  ═════════                                                 │
│                                                            │
│  These agents get:                                         │
│  • Fastest models (Haiku, GPT-4o-mini)                     │
│  • Minimal token usage                                     │
│  • Lowest latency                                          │
│                                                            │
│  📋 Summarizer                    🎯 Coordinator            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Routing Rules

### By Task Type

```yaml
task_routing:
  # Analysis & Reasoning
  "analyze|evaluate|compare|assess|diagnose":
    primary: analyst
    fallback: researcher
    tier: reasoning

  # System Design
  "design|architect|plan system|structure":
    primary: architect
    fallback: analyst
    tier: reasoning

  # Code Tasks
  "review code|check code|code quality":
    primary: code-reviewer
    tier: reasoning

  "debug|fix bug|troubleshoot|error":
    primary: debugger
    fallback: code-reviewer
    tier: reasoning

  # Research & Information
  "research|find|search|investigate|look up":
    primary: researcher
    fallback: analyst
    tier: balanced

  "verify|fact check|validate claim":
    primary: fact-checker
    fallback: researcher
    tier: balanced

  # Content Creation
  "write|draft|compose|create content":
    primary: writer
    fallback: copywriter
    tier: balanced

  "edit|revise|improve|refine":
    primary: editor
    fallback: writer
    tier: balanced

  "marketing|copy|headline|CTA|ad":
    primary: copywriter
    fallback: writer
    tier: balanced

  # Planning & Coordination
  "plan|break down|task list|roadmap":
    primary: planner
    fallback: analyst
    tier: balanced

  "coordinate|orchestrate|manage workflow":
    primary: coordinator
    tier: fast

  # Transformation
  "translate|convert|localize":
    primary: translator
    tier: balanced

  "summarize|tldr|condense|brief":
    primary: summarizer
    tier: fast

  # Education
  "explain|teach|help understand|learn":
    primary: tutor
    fallback: writer
    tier: balanced
```

### By Complexity

```yaml
complexity_routing:
  simple:
    # Single-step, clear input/output
    prefer_tier: fast
    agents: [summarizer, coordinator]

  moderate:
    # Multi-step, some ambiguity
    prefer_tier: balanced
    agents: [researcher, writer, editor, planner]

  complex:
    # Deep analysis, architectural decisions
    prefer_tier: reasoning
    agents: [analyst, architect, debugger, code-reviewer]
```

---

## Handoff Network

```
                    ┌─────────────┐
                    │ COORDINATOR │
                    │     🎯      │
                    └──────┬──────┘
                           │ orchestrates all
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ RESEARCHER  │ │   WRITER    │ │  DEBUGGER   │
    │     🔍      │ │     ✍️      │ │     🐛      │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           │ findings      │ draft         │ diagnosis
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   ANALYST   │ │   EDITOR    │ │  ARCHITECT  │
    │     📊      │ │     ✂️      │ │     🏗️      │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           │ analysis      │ refined       │ design
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  ARCHITECT  │ │FACT CHECKER │ │CODE REVIEWER│
    │     🏗️      │ │     ✓       │ │     🔎      │
    └─────────────┘ └─────────────┘ └─────────────┘
```

### Explicit Handoff Rules

```yaml
handoffs:
  researcher:
    escalates_to: analyst       # When interpretation needed
    delegates_to: fact-checker  # When claims need verification
    receives_from: [analyst, planner, coordinator]

  analyst:
    escalates_to: architect     # When systemic design needed
    delegates_to: researcher    # When more data needed
    receives_from: [researcher, debugger, coordinator]

  architect:
    escalates_to: human         # Final design approval
    delegates_to: [analyst, code-reviewer]
    receives_from: [analyst, debugger, planner]

  debugger:
    escalates_to: architect     # When issue is design-level
    delegates_to: code-reviewer # When fix needs review
    receives_from: [code-reviewer, coordinator]

  code-reviewer:
    escalates_to: architect     # For design concerns
    delegates_to: debugger      # For issue investigation
    receives_from: [debugger, coordinator]

  writer:
    escalates_to: editor        # When refinement needed
    delegates_to: fact-checker  # When claims need verification
    receives_from: [researcher, analyst, coordinator]

  editor:
    escalates_to: human         # For subjective decisions
    delegates_to: fact-checker  # For accuracy
    receives_from: [writer, copywriter, coordinator]

  copywriter:
    escalates_to: editor        # For refinement
    delegates_to: fact-checker  # For claim verification
    receives_from: [writer, coordinator]

  fact-checker:
    escalates_to: researcher    # For deeper investigation
    receives_from: [writer, editor, copywriter, researcher]

  planner:
    escalates_to: architect     # For systemic planning
    delegates_to: researcher    # For scope discovery
    receives_from: [analyst, coordinator]

  summarizer:
    escalates_to: analyst       # When interpretation needed
    receives_from: [researcher, coordinator]

  translator:
    escalates_to: human         # For cultural nuance
    delegates_to: editor        # For target language polish
    receives_from: [writer, coordinator]

  tutor:
    escalates_to: human         # When learner needs more
    delegates_to: researcher    # For additional examples
    receives_from: [coordinator]

  coordinator:
    can_invoke: [all]           # Orchestrates any agent
    escalates_to: human         # When agents conflict
```

---

## Semantic Focus Quick Reference

| Agent | Semantic Focus (Question Asked of Memory) |
|-------|------------------------------------------|
| Researcher | What does this project need to know? What's established? |
| Analyst | What patterns exist? What do they mean? |
| Summarizer | What is the core meaning? What must be preserved? |
| Fact Checker | Is this claim verifiable? What's the evidence? |
| Writer | Who is the audience? What tone fits? |
| Editor | What's the standard? Where does content fall short? |
| Copywriter | What drives this audience? What's the desired action? |
| Code Reviewer | What are the project's standards? What patterns are used? |
| Architect | What are the constraints? What patterns fit? |
| Debugger | What's expected vs actual behavior? |
| Planner | What's the goal? What are the constraints? |
| Coordinator | What needs to happen? Who's best suited? |
| Translator | What's the core meaning? What's idiomatic in target? |
| Tutor | What does the learner know? What's the gap? |

---

## Usage in UI

### Sidebar Agent Selector
```
┌─────────────────────────┐
│  Select Agent           │
├─────────────────────────┤
│  ⚡ REASONING           │
│  ├─ 📊 Analyst          │
│  ├─ 🏗️ Architect        │
│  ├─ 🔎 Code Reviewer    │
│  └─ 🐛 Debugger         │
│                         │
│  ⚖️ BALANCED            │
│  ├─ 🔍 Researcher       │
│  ├─ ✍️ Writer           │
│  ├─ ✂️ Editor           │
│  ├─ 📣 Copywriter       │
│  ├─ ✓ Fact Checker      │
│  ├─ 📅 Planner          │
│  ├─ 🌐 Translator       │
│  └─ 🎓 Tutor            │
│                         │
│  🚀 FAST                │
│  ├─ 📋 Summarizer       │
│  └─ 🎯 Coordinator      │
│                         │
│  + Custom Agent         │
└─────────────────────────┘
```
