---
title: Built-in Agents
description: The 14 specialized agent personas available in Chorum.
---

# Built-in Agents

Chorum comes with 14 specialized agent personas, each tuned with a specific system prompt and model preference to excel at different tasks.

## Why Specialized Agents?

A generic "Assistant" is okay at everything but great at nothing. Specialization allows us to:

- **Tune the prompt**: An "Architect" needs to think about trade-offs; a "Code Reviewer" needs to be critical.
- **Select the model**: "Researcher" benefits from 100k context; "Debugger" needs reasoning power.
- **Adjust parameters**: Creative writing needs higher temperature than code generation.

---

## The Agents

| Agent | Icon | Best For | Role Description |
|-------|------|----------|------------------|
| **Analyst** | 📊 | Requirements, Data | Breaks down vague requirements into clear specs. Asks clarifying questions. |
| **Architect** | 🏛️ | System Design | High-level system design, trade-offs, database schema, scalability. |
| **Code Reviewer** | 🧐 | Audit, Security | Critiques code for bugs, security issues, and style violations. |
| **Coder** | 💻 | Implementation | Writing clean, functional code. The default for most dev tasks. |
| **Debugger** | 🐞 | Fixing Issues | Analyzing error logs, stack traces, and explaining root causes. |
| **Designer** | 🎨 | UI/UX | CSS, Tailwind, user flow, accessibility, visual design. |
| **Executive** | 👔 | Strategy | High-level summaries, business logic, roadmap planning. |
| **Planner** | 📅 | Task Management | Breaking big goals into actionable steps and checklists. |
| **Product Manager** | 📋 | Features, User Stories | Defining user value, prioritization, writing PRDs. |
| **Researcher** | 🔍 | Deep Dives | Exploring new technologies, summarizing documentation, finding libraries. |
| **Security Engineer** | 🔒 | Auditing | Focused specifically on vulnerabilities, auth flows, and hardened config. |
| **Teacher** | 🎓 | Learning | Explaining concepts simply, creating tutorials, patience. |
| **Tech Lead** | 🦁 | Guidance | Balancing technical excellence with delivery. Good for "how should I approach this?" |
| **Writer** | ✍️ | Documentation | Writing READMEs, API docs, release notes, and blog posts. |

---

## Choosing an Agent

You can switch agents at any time using the dropdown in the chat header.

### Auto-Selection (Router)

If you leave the selection on **Auto** (coming soon), Chorum will classify your request and pick the best agent for you.

- "Why is this crashing?" → **Debugger**
- "Design a DB schema" → **Architect**
- "Write a blog post" → **Writer**

### Manual Selection

For multi-step tasks, stick with one agent to maintain persona.

- **Example**: Creating a new feature
  1. Start with **Product Manager** to define the spec
  2. Switch to **Architect** to design the data model
  3. Switch to **Coder** to implement it
  4. Switch to **Code Reviewer** to audit the work

---

## Related Documentation

- **[Custom Agents](./custom.md)** — Creating your own personas
- **[Chat Overview](../chat/overview.md)** — Using the chat interface
