# Multi-Agent Workflows

## Workflow Definition Schema

```yaml
workflow:
  name: string
  description: string
  trigger: string | pattern      # What initiates this workflow
  steps:
    - agent: string
      task: string
      depends_on: string[]       # Previous step IDs
      outputs: string[]          # Named outputs for later steps
      checkpoint: boolean        # Requires human approval?
  final_output: string           # How to combine results
```

---

## Pre-Defined Workflows

### Content Creation Pipeline

```yaml
workflow:
  name: content_creation
  description: "Research → Write → Edit → Fact-check pipeline"
  trigger: "write a blog post|create an article|draft content"

  steps:
    - id: research
      agent: researcher
      task: "Gather information on {topic}"
      depends_on: []
      outputs: [findings, sources]
      checkpoint: false

    - id: write
      agent: writer
      task: "Draft content based on research findings"
      depends_on: [research]
      inputs:
        findings: research.findings
        sources: research.sources
      outputs: [draft]
      checkpoint: false

    - id: edit
      agent: editor
      task: "Refine draft for clarity and flow"
      depends_on: [write]
      inputs:
        content: write.draft
      outputs: [edited_draft]
      checkpoint: false

    - id: fact_check
      agent: fact-checker
      task: "Verify factual claims in content"
      depends_on: [edit]
      inputs:
        content: edit.edited_draft
      outputs: [verified_draft, corrections]
      checkpoint: true  # Human reviews before publish

  final_output: |
    Combine edited_draft with fact_check corrections.
    Present to human for final approval.
```

### Technical Design Pipeline

```yaml
workflow:
  name: technical_design
  description: "Analyze → Architect → Plan pipeline"
  trigger: "design a|architect|build a system for"

  steps:
    - id: analyze
      agent: analyst
      task: "Analyze requirements and constraints for {system}"
      depends_on: []
      outputs: [analysis, constraints, tradeoffs]
      checkpoint: false

    - id: design
      agent: architect
      task: "Design system architecture based on analysis"
      depends_on: [analyze]
      inputs:
        requirements: analyze.analysis
        constraints: analyze.constraints
      outputs: [architecture, decision_record]
      checkpoint: true  # Human approves design

    - id: plan
      agent: planner
      task: "Create implementation plan from approved design"
      depends_on: [design]
      inputs:
        architecture: design.architecture
      outputs: [task_breakdown, milestones]
      checkpoint: false

  final_output: |
    Comprehensive design document with:
    - Analysis summary
    - Architecture decision record
    - Implementation plan
```

### Bug Fix Pipeline

```yaml
workflow:
  name: bug_fix
  description: "Debug → Fix → Review pipeline"
  trigger: "fix|debug|troubleshoot|broken"

  steps:
    - id: investigate
      agent: debugger
      task: "Investigate and diagnose {issue}"
      depends_on: []
      outputs: [diagnosis, root_cause, proposed_fix]
      checkpoint: true  # Human approves approach

    - id: review
      agent: code-reviewer
      task: "Review proposed fix for quality and security"
      depends_on: [investigate]
      inputs:
        fix: investigate.proposed_fix
        context: investigate.root_cause
      outputs: [review_result, suggestions]
      checkpoint: false

    - id: iterate
      agent: debugger
      task: "Apply review suggestions if needed"
      depends_on: [review]
      condition: "review.review_result != 'approved'"
      inputs:
        suggestions: review.suggestions
        original_fix: investigate.proposed_fix
      outputs: [final_fix]
      checkpoint: false

  final_output: |
    Fix ready for deployment:
    - Root cause documented
    - Code reviewed
    - Test case included
```

### Code Review Pipeline

```yaml
workflow:
  name: code_review
  description: "Review → Security Check → Feedback"
  trigger: "review this pr|review this code"

  steps:
    - id: quality_review
      agent: code-reviewer
      task: "Review code for quality, patterns, maintainability"
      depends_on: []
      outputs: [quality_issues, suggestions]
      checkpoint: false

    - id: security_review
      agent: code-reviewer
      task: "Review code specifically for security vulnerabilities"
      depends_on: []  # Parallel with quality review
      outputs: [security_issues]
      checkpoint: false

    - id: architecture_check
      agent: architect
      task: "Check if changes align with system architecture"
      depends_on: [quality_review]
      condition: "quality_review.quality_issues.architecture_concerns.length > 0"
      outputs: [architecture_feedback]
      checkpoint: false

  final_output: |
    Consolidated review:
    - Quality feedback
    - Security findings (critical priority)
    - Architecture alignment
    - Overall recommendation: approve/request changes
```

---

## Workflow Execution Patterns

### Sequential
```
A ──► B ──► C ──► D
```
Each step waits for previous to complete.

### Parallel
```
    ┌──► B ──┐
A ──┤        ├──► D
    └──► C ──┘
```
B and C run simultaneously after A.

### Conditional
```
A ──► B ──► [condition] ──► C (if true)
                       └──► D (if false)
```
Branching based on output.

### Iterative
```
A ──► B ──► [check] ──► C (if done)
             │
             └──► A (if not done)
```
Loop until condition met.

---

## Custom Workflow Definition

Users can define custom workflows in `.chorum/orchestration/custom/`:

```yaml
# .chorum/orchestration/custom/my-workflow.md

workflow:
  name: weekly_report
  description: "Generate weekly project status report"
  trigger: "weekly report|status update"

  steps:
    - id: gather_updates
      agent: researcher
      task: "Gather this week's completed tasks and progress"
      outputs: [updates, metrics]

    - id: summarize
      agent: summarizer
      task: "Create executive summary of progress"
      depends_on: [gather_updates]
      outputs: [summary]

    - id: draft_report
      agent: writer
      task: "Write formatted weekly report"
      depends_on: [gather_updates, summarize]
      outputs: [report]

    - id: review
      agent: editor
      task: "Polish report for stakeholders"
      depends_on: [draft_report]
      outputs: [final_report]
      checkpoint: true

  final_output: final_report
```

---

## Human Checkpoints

```yaml
checkpoint_config:
  # When checkpoints are required

  always_checkpoint:
    - Before external actions (emails, deploys, API calls)
    - Before irreversible changes
    - After security-relevant analysis
    - After architecture decisions
    - Before publishing content

  checkpoint_behavior:
    show_context: true          # Show what led to this point
    show_recommendation: true   # Show agent's suggestion
    allow_modify: true          # Human can edit before proceeding
    allow_reject: true          # Human can reject and retry
    allow_skip: false           # Cannot skip required checkpoints

  checkpoint_timeout:
    default: 24h                # Auto-expire if not addressed
    critical: never             # Security checkpoints don't expire
```

---

## Workflow State Management

```yaml
state_management:
  # How workflow state is tracked

  persistence:
    store: ".chorum/memory/sessions/{session_id}.json"
    include:
      - Current step
      - Completed steps with outputs
      - Pending checkpoints
      - Error states

  recovery:
    on_failure: pause_and_notify
    on_timeout: retry_once_then_pause
    on_conflict: escalate_to_human

  history:
    retain_completed: 30_days
    retain_failed: 90_days
```
