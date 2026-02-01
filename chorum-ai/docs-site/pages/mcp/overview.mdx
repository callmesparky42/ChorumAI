---
title: MCP Integration Overview
description: Connect external AI agents to your ChorumAI memory using the Model Context Protocol.
---

# MCP Integration Overview

ChorumAI exposes your project memory to external AI agents through the Model Context Protocol (MCP).

## Why This Matters

IDE agents like Claude Code, Cursor, and Windsurf are **stateless by design**—they start fresh every session. ChorumAI bridges this gap by giving these agents access to your persistent patterns, decisions, and invariants.

---

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard that allows AI assistants to connect with external tools and data sources. Think of it as a USB port for AI—a standardized way for different systems to talk to each other.

When you connect your IDE to ChorumAI via MCP:

- Your AI agent can **query** your project memory
- Relevant patterns and decisions are **injected** into context
- The agent can **propose** new learnings (pending your approval)
- Every interaction strengthens your project's **confidence score**

---

## Architecture

```
┌─────────────────┐                      ┌─────────────────────────┐
│   Claude Code   │                      │     ChorumAI MCP        │
│   Cursor        │◄─── MCP Protocol ───►│       Server            │
│   Windsurf      │    (stdio/HTTP)      │                         │
│   Any MCP Client│                      │  ┌─────────────────┐    │
└─────────────────┘                      │  │ Project Memory  │    │
                                         │  │   Database      │    │
                                         │  └─────────────────┘    │
                                         └─────────────────────────┘
```

The MCP server runs locally via `npx chorum-mcp`. Your IDE communicates with it using the MCP protocol, and the server queries your ChorumAI memory on behalf of the agent.

---

## Key Concepts

### Read Operations (No Approval Required)

Your AI agent can freely read from your memory:

| Tool | What It Does |
|------|--------------|
| `chorum_list_projects` | List all your projects |
| `chorum_query_memory` | Semantic search through patterns, decisions, invariants |
| `chorum_get_invariants` | Get all active "must not break" rules |
| `chorum_get_project_context` | Get project metadata (tech stack, instructions) |

### Write Operations (Human-in-the-Loop)

When an agent wants to add to your memory:

| Tool | What It Does |
|------|--------------|
| `chorum_propose_learning` | Propose a new pattern or decision |
| `chorum_log_interaction` | Log the interaction for confidence scoring |

Proposed learnings require your approval in the ChorumAI UI before they're added to memory. This keeps you in control of what your AI "remembers."

---

## Security Model

- **Token-based authentication** — Each API token is scoped to a single user
- **Revocable tokens** — Revoke access anytime from Settings
- **Human approval for writes** — Agents can't modify your memory without permission
- **Local-first** — The MCP server runs on your machine, not in the cloud

---

## Getting Started

1. **[Setup Guide](./setup.md)** — Generate a token and configure your IDE
2. **[Tools Reference](./tools-reference.md)** — Detailed documentation for each MCP tool
3. **[IDE Integration](./ide-integration.md)** — Specific instructions for Claude Code, Cursor, Windsurf

---

## Example: How It Works in Practice

You're working in Claude Code on your authentication module. You ask:

> "What's the auth pattern for this project?"

Claude Code calls `chorum_query_memory` with your question. ChorumAI returns:

```json
{
  "items": [
    {
      "type": "decision",
      "content": "JWT with refresh tokens, httpOnly cookies for session management",
      "relevanceScore": 0.92
    },
    {
      "type": "invariant",
      "content": "Never store tokens in localStorage—use httpOnly cookies only",
      "relevanceScore": 0.87
    }
  ]
}
```

Claude Code now has the context to give you a response that matches your project's established patterns.

---

*"Use whatever IDE you want. ChorumAI is where your AI remembers you."*
