# Project Memory

> This file holds the semantic understanding of the project. Agents read this to understand context.
> **This is bidirectional** — agents also write learnings back here.

---

## Project Identity

**Name:** Chorum AI
**Type:** Multi-provider LLM aggregator with agent orchestration
**Stage:** Active development

## Core Purpose

Build an intelligent LLM interface that:
1. Routes tasks to appropriate providers based on cost, capability, and context
2. Maintains project memory across conversations
3. Orchestrates specialized agents for different task types
4. Learns from interactions to improve over time

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL (via Drizzle ORM)
- **Auth:** NextAuth.js
- **LLM Providers:** Anthropic (Claude), OpenAI (GPT), Google (Gemini)

## Key Architectural Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Markdown-based memory | Human-readable, versionable, portable | 2025-01 |
| Agent orchestration layer | Separation of concerns, specialized roles | 2025-01 |
| Semantic focus over raw context | Efficiency, meaning preservation | 2025-01 |

## Current Focus

- Agent orchestration system design
- UI for agent selection (sidebar)
- Bidirectional memory flow implementation

## Constraints

- Must work with multiple LLM providers
- Must be cost-aware (budget tracking)
- Must preserve user privacy (local-first memory)
- Must be inspectable (no black-box decisions)

---

## Learned Patterns

> Agents write patterns here as they discover them

*No patterns recorded yet.*

---

## Open Questions

- How to handle agent conflicts?
- Optimal memory summarization strategy?
- UI for showing "what agent understood"?

---

*Last updated: Auto-maintained by agents*
