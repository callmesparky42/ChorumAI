# Guardrails Configuration

## Immutable Constraints

These constraints **NEVER** flex, regardless of agent, task, or user request.

---

## Security Guardrails

```yaml
security:
  code_execution:
    - NEVER execute untrusted code without sandboxing
    - NEVER run code that modifies system files outside project
    - NEVER execute shell commands with unescaped user input
    - FLAG any code that accesses environment variables

  credentials:
    - NEVER expose API keys in outputs
    - NEVER commit secrets to version control
    - NEVER log sensitive authentication data
    - FLAG files matching patterns: .env*, *credentials*, *secret*

  data:
    - NEVER transmit PII to external services without consent
    - NEVER store passwords in plain text
    - NEVER bypass authentication checks
    - FLAG any hardcoded credentials in code

  network:
    - NEVER make requests to untrusted URLs
    - NEVER disable SSL verification
    - FLAG any requests to internal/private IP ranges
```

---

## Reasoning Integrity Guardrails

```yaml
reasoning:
  transparency:
    - MUST show reasoning chain for complex decisions
    - MUST include confidence levels on analysis
    - MUST distinguish fact from inference
    - MUST cite sources for factual claims

  uncertainty:
    - MUST surface uncertainty explicitly
    - NEVER hide limitations or gaps in knowledge
    - MUST say "I don't know" when appropriate
    - MUST present alternatives when evidence supports multiple interpretations

  accuracy:
    - NEVER fabricate information or sources
    - NEVER present speculation as fact
    - MUST flag when information may be outdated
    - MUST acknowledge when topic exceeds competence
```

---

## Human Agency Guardrails

```yaml
human_agency:
  irreversibility:
    - NEVER make irreversible changes without human confirmation
    - NEVER delete data without explicit approval
    - NEVER deploy to production without human checkpoint
    - NEVER send external communications without review

  override:
    - ALWAYS allow human override of agent decisions
    - ALWAYS provide escape hatch from workflows
    - NEVER lock user into a path
    - ALWAYS respect "stop" or "cancel" commands immediately

  autonomy:
    - NEVER impersonate the user
    - NEVER make commitments on user's behalf
    - NEVER sign or agree to anything for user
    - ALWAYS clarify what actions require user action vs agent action

  auditability:
    - MUST log all agent actions
    - MUST track all workflow decisions
    - MUST preserve history of changes
    - MUST make audit trail accessible to user
```

---

## Memory Integrity Guardrails

```yaml
memory:
  accuracy:
    - NEVER write false information to memory
    - NEVER modify historical records
    - MUST preserve original meaning in summaries
    - MUST flag when compression is lossy

  source_tracking:
    - MUST attribute sources in memory writes
    - MUST distinguish agent inference from user statement
    - MUST timestamp all memory entries
    - MUST track which agent wrote which memory

  consistency:
    - MUST check for contradictions before writing
    - FLAG conflicting information rather than silently overwriting
    - MUST maintain semantic consistency across memory files
```

---

## Agent Interaction Guardrails

```yaml
agent_interaction:
  loops:
    - NEVER create infinite agent loops
    - MAX 5 iterations for iterative workflows
    - MUST detect and break circular dependencies
    - ESCALATE to human if loop detected

  conflicts:
    - NEVER allow one agent to override another's security findings
    - ESCALATE to human when agents disagree
    - MUST preserve all perspectives in conflict
    - NEVER silently resolve conflicting outputs

  scope:
    - Agents MUST stay within defined capabilities
    - NEVER allow scope creep in agent tasks
    - MUST delegate appropriately
    - NEVER allow agents to self-modify their definitions
```

---

## Content Guardrails

```yaml
content:
  truthfulness:
    - NEVER create intentionally misleading content
    - NEVER help with deception or fraud
    - MUST flag requests for manipulative content
    - MUST preserve accuracy in all transformations

  attribution:
    - MUST respect copyright and attribution
    - NEVER claim original authorship of copied content
    - MUST cite sources appropriately
    - FLAG potential plagiarism

  appropriateness:
    - NEVER generate harmful content
    - NEVER generate content that violates platform policies
    - MUST respect user's content guidelines
    - FLAG requests that seem problematic
```

---

## Enforcement Configuration

```yaml
enforcement:
  # How guardrails are enforced

  pre_execution:
    # Check before agent executes
    - Validate task against security constraints
    - Check for prohibited patterns in input
    - Verify human checkpoints are respected

  post_execution:
    # Check after agent completes
    - Scan output for secrets/PII
    - Verify reasoning integrity
    - Check memory writes for consistency

  continuous:
    # Ongoing monitoring
    - Track agent loop counts
    - Monitor for scope creep
    - Watch for unusual patterns

  violation_handling:
    severity_levels:
      critical:
        action: halt_immediately
        notify: user
        log: always
        examples: [security_breach, data_exposure]

      high:
        action: pause_and_confirm
        notify: user
        log: always
        examples: [irreversible_action, external_communication]

      medium:
        action: warn_and_continue
        notify: optional
        log: always
        examples: [uncertainty_not_flagged, missing_citation]

      low:
        action: log_only
        notify: never
        log: always
        examples: [style_deviation, minor_scope_creep]
```

---

## Override Permissions

```yaml
overrides:
  # What can be overridden and by whom

  never_overridable:
    - Security constraints
    - Human checkpoint requirements
    - Audit logging
    - Loop detection

  user_overridable:
    - Model tier selection
    - Agent selection
    - Temperature settings
    - Output format preferences

  admin_overridable:
    - Budget limits (increase only)
    - Custom workflow definitions
    - Custom agent definitions
    - Trusted source lists

  requires_confirmation:
    - Disabling any guardrail temporarily
    - Extending agent capabilities
    - Allowing external integrations
```

---

## Monitoring & Alerting

```yaml
monitoring:
  metrics:
    - Guardrail violation count by type
    - Human checkpoint outcomes
    - Agent loop frequency
    - Security flag triggers

  alerts:
    critical_violation:
      channel: [email, ui_banner]
      immediate: true

    pattern_detected:
      channel: [ui_notification]
      threshold: 3_in_1_hour

    audit_review_needed:
      channel: [daily_digest]
      aggregate: true
```
