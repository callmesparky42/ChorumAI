---
title: API Endpoints
description: Detailed reference for key Chorum API endpoints.
---

# API Endpoints

This reference covers the most commonly used endpoints for managing memory and interacting with Chorum.

---

## Projects

### List Projects
`GET /api/projects`

Returns all projects for the authenticated user.

**Response:**
```json
{
  "projects": [
    { "id": "proj_123", "name": "Chorum API", "description": "..." },
    { "id": "proj_456", "name": "Frontend", "description": "..." }
  ]
}
```

### Get Project
`GET /api/projects/[id]`

Returns details for a specific project, including stats.

---

## Memory

### Query Memory
`POST /api/memory/search`

Semantic search for relevant learnings.

**Body:**
```json
{
  "projectId": "proj_123",
  "query": "How do we handle auth?",
  "limit": 5
}
```

**Response:**
```json
{
  "results": [
    { "type": "pattern", "content": "Use HTTP-only cookies...", "score": 0.89 },
    { "type": "invariant", "content": "Never store tokens in localstorage", "score": 0.95 }
  ]
}
```

### Add Learning (Propose)
`POST /api/memory/learn`

Propose a new learning item (goes to Pending queue if from external source).

**Body:**
```json
{
  "projectId": "proj_123",
  "type": "pattern",
  "content": "Always use absolute imports",
  "source": "api-client"
}
```

---

## Chat

### Send Message
`POST /api/chat`

Send a message to an agent.

**Body:**
```json
{
  "projectId": "proj_123",
  "message": "Hello, can you explain the auth flow?",
  "agentId": "agent_architect", // optional
  "model": "claude-3-opus" // optional
}
```

**Response (Streamed):**
Returns a stream of text chunks.

---

## System

### Health Check
`GET /api/health`

Returns status `200 OK` if the server is running.

---

## Related Documentation

- **[API Overview](./overview.md)** — Authentication and format
- **[MCP Tools](../mcp/tools-reference.md)** — MCP-specific tool definitions
