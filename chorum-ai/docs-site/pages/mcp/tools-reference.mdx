---
title: MCP Tools Reference
description: Complete reference for all ChorumAI MCP tools with parameters and examples.
---

# MCP Tools Reference

Complete reference for all tools exposed by the ChorumAI MCP server.

## Why This Matters

Understanding what each tool does helps you get the most out of MCP integration—and helps you debug when things don't work as expected.

---

## Read Tools

These tools allow AI agents to read from your memory without requiring approval.

---

### `chorum_list_projects`

List all projects accessible by the authenticated user.

**Input Schema:**
```typescript
{
  // No required parameters
}
```

**Output:**
```typescript
{
  projects: {
    id: string;
    name: string;
    lastActivity: string;  // ISO timestamp
  }[];
}
```

**Example Response:**
```json
{
  "projects": [
    {
      "id": "proj_abc123",
      "name": "ChorumAI",
      "lastActivity": "2026-01-31T14:23:00Z"
    },
    {
      "id": "proj_def456",
      "name": "Marketing Site",
      "lastActivity": "2026-01-30T09:15:00Z"
    }
  ]
}
```

---

### `chorum_query_memory`

Semantic search through project memory. Returns patterns, decisions, invariants, and facts ranked by relevance.

**Input Schema:**
```typescript
{
  projectId: string;           // Required: which project's memory
  query: string;               // Natural language query
  types?: LearningType[];      // Optional filter: 'pattern' | 'antipattern' | 'decision' | 'invariant'
  maxTokens?: number;          // Budget limit (default: 2000, max: 8000)
  includeContext?: boolean;    // Include surrounding context (default: true)
}
```

**Output:**
```typescript
{
  items: {
    id: string;
    type: LearningType;
    content: string;
    context?: string;
    relevanceScore: number;    // 0.0 to 1.0
    createdAt: string;
  }[];
  tokenCount: number;
  projectName: string;
}
```

**Example Usage:**
```
Agent: "What error handling patterns does this project use?"
```

**Example Response:**
```json
{
  "items": [
    {
      "id": "learn_789",
      "type": "pattern",
      "content": "All API errors return structured JSON with code, message, and details fields",
      "relevanceScore": 0.87,
      "createdAt": "2026-01-15T10:00:00Z"
    },
    {
      "id": "learn_790",
      "type": "invariant",
      "content": "Never expose stack traces in production error responses",
      "relevanceScore": 0.82,
      "createdAt": "2026-01-10T16:30:00Z"
    }
  ],
  "tokenCount": 142,
  "projectName": "ChorumAI"
}
```

---

### `chorum_get_invariants`

Get all active invariants for a project. Invariants are rules that must never be broken.

**Input Schema:**
```typescript
{
  projectId: string;
}
```

**Output:**
```typescript
{
  invariants: {
    id: string;
    content: string;
    checkType: 'keyword' | 'regex' | 'semantic';
    checkValue?: string;
    severity: 'warning' | 'error';
  }[];
}
```

**Example Response:**
```json
{
  "invariants": [
    {
      "id": "inv_001",
      "content": "Never use console.log in production code",
      "checkType": "keyword",
      "checkValue": "console.log",
      "severity": "warning"
    },
    {
      "id": "inv_002",
      "content": "All API routes must have authentication middleware",
      "checkType": "semantic",
      "severity": "error"
    }
  ]
}
```

**Best Practice:** AI agents should call this before generating code to ensure they don't violate any project rules.

---

### `chorum_get_project_context`

Get high-level project metadata including tech stack, custom instructions, and confidence score.

**Input Schema:**
```typescript
{
  projectId: string;
}
```

**Output:**
```typescript
{
  name: string;
  description: string;
  techStack: string[];
  customInstructions: string;
  confidence: {
    score: number;           // 0-100
    interactionCount: number;
  };
  criticalFiles: string[];
}
```

**Example Response:**
```json
{
  "name": "ChorumAI",
  "description": "Multi-provider LLM orchestration platform",
  "techStack": ["Next.js", "TypeScript", "Drizzle ORM", "PostgreSQL", "Supabase"],
  "customInstructions": "Prefer explicit TypeScript types. Use Zod for runtime validation.",
  "confidence": {
    "score": 78,
    "interactionCount": 247
  },
  "criticalFiles": ["src/lib/providers.ts", "src/lib/db/schema.ts"]
}
```

---

## Write Tools

These tools modify your memory. They require human approval before changes take effect.

---

### `chorum_propose_learning`

Propose a new pattern, decision, or learning item. The proposal is queued for user approval.

**Input Schema:**
```typescript
{
  projectId: string;
  type: 'pattern' | 'antipattern' | 'decision' | 'invariant';
  content: string;              // The learning content
  context?: string;             // Why this was learned
  source: string;               // Agent identifier: "claude-code", "cursor", etc.
}
```

**Output:**
```typescript
{
  proposalId: string;
  status: 'pending_approval';
  message: string;
}
```

**Example Usage:**
```
Agent notices you consistently use early returns. It proposes:
```

```json
{
  "projectId": "proj_abc123",
  "type": "pattern",
  "content": "Use early returns to reduce nesting in handler functions",
  "context": "Observed in multiple code review sessions",
  "source": "claude-code"
}
```

**Example Response:**
```json
{
  "proposalId": "prop_xyz789",
  "status": "pending_approval",
  "message": "Proposal queued. User will review in ChorumAI UI."
}
```

**User Flow:**
1. Agent calls `chorum_propose_learning`
2. Proposal appears in ChorumAI's **Pending Learnings** section
3. User reviews, optionally edits, then approves or denies
4. If approved, the item is added to project memory

---

### `chorum_log_interaction`

Log that an interaction occurred. Used for confidence scoring. Auto-approved (no human review required).

**Input Schema:**
```typescript
{
  projectId: string;
  source: string;               // "claude-code", "cursor", "windsurf", etc.
  queryType: 'trivial' | 'moderate' | 'complex' | 'critical';
}
```

**Output:**
```typescript
{
  success: boolean;
  newConfidenceScore: number;   // Updated project confidence
}
```

**Example Response:**
```json
{
  "success": true,
  "newConfidenceScore": 79
}
```

**Why This Matters:** More interactions increase your project's confidence score, which affects how much context is injected into future queries.

---

## Learning Types

| Type | Description | Example |
|------|-------------|---------|
| `pattern` | Coding conventions, recurring approaches | "Use early returns to reduce nesting" |
| `antipattern` | Things to avoid | "Don't use `any` type in TypeScript" |
| `decision` | Technical choices with rationale | "Chose PostgreSQL over SQLite for multi-user support" |
| `invariant` | Rules that must never be violated | "All API routes require auth middleware" |

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Requests per minute | 100 |
| Max tokens per query | 8,000 |
| Max pending proposals | 50 |

Exceeding rate limits returns a `429 Too Many Requests` error.

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "invalid_token",
    "message": "Token not found or revoked"
  }
}
```

| Error Code | Meaning |
|------------|---------|
| `invalid_token` | Token is invalid, expired, or revoked |
| `project_not_found` | Project ID doesn't exist or user lacks access |
| `rate_limited` | Too many requests |
| `invalid_input` | Missing required fields or invalid values |

---

## Related Documentation

- **[MCP Overview](./overview.md)** — What MCP is and why it matters
- **[Setup Guide](./setup.md)** — Token generation and configuration
- **[IDE Integration](./ide-integration.md)** — Per-IDE setup instructions
