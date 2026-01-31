# ChorumAI MCP Server Setup Guide

This guide explains how to connect external AI coding assistants (Claude Desktop, Cursor, Windsurf, Gemini Code Assist) to your ChorumAI project memory using the Model Context Protocol (MCP).

## Overview

The ChorumAI MCP Server exposes your project learnings, patterns, and invariants to external AI agents. This enables:

- **Context sharing**: Your coding assistant automatically receives relevant patterns and decisions
- **Invariant enforcement**: Critical rules are surfaced when the agent works on related code
- **Learning proposals**: The agent can propose new patterns (pending your approval)
- **Confidence tracking**: Interactions are logged to improve memory relevance

## Prerequisites

1. A ChorumAI account with at least one project
2. One of the supported IDEs:
   - Claude Desktop
   - Cursor
   - Windsurf
   - VS Code with Continue extension
   - Gemini Code Assist (Antigravity)

## Step 1: Generate an API Token

### Via Web UI

1. Open ChorumAI in your browser
2. Navigate to **Settings** → **MCP Integration**
3. Click **New Token**
4. **Important**: Copy the token immediately - it won't be shown again!

### Via CLI

```bash
chorum login  # If not already logged in
chorum mcp config
```

This displays the MCP configuration with your token.

## Step 2: Configure Your IDE

ChorumAI uses HTTP transport, so configuration is simple—just add the URL and your token.

### Claude Desktop

Edit `~/.config/claude-desktop/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://chorum.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Cursor

Edit your Cursor settings (Settings → MCP Servers):

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://chorum.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Windsurf

Edit your Windsurf configuration file:

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://chorum.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### VS Code + Continue

Add to your Continue configuration:

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://chorum.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Gemini Code Assist (Antigravity)

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://chorum.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

## Step 3: Verify Connection

After restarting your IDE, the MCP server should connect automatically. You can verify by:

1. Running `chorum mcp status` in your terminal
2. Checking your IDE's MCP server status panel
3. Looking for ChorumAI tools in your agent's tool list

## Available Tools

Once connected, your AI agent has access to these tools:

| Tool | Description |
|------|-------------|
| `chorum_list_projects` | List all your ChorumAI projects |
| `chorum_query_memory` | Semantic search through project memory |
| `chorum_get_invariants` | Get all active invariants (must-not-break rules) |
| `chorum_get_project_context` | Get project metadata (tech stack, instructions) |
| `chorum_propose_learning` | Propose a new pattern or decision (pending approval) |
| `chorum_log_interaction` | Log interaction for confidence scoring |

## Example Usage

Once configured, your AI agent can use ChorumAI context automatically. For example:

**Agent prompt**: "What patterns should I follow for error handling in this project?"

The agent will call `chorum_query_memory` with your query and receive relevant patterns:

```json
{
  "items": [
    {
      "type": "pattern",
      "content": "All API errors should return structured JSON with code, message, and details fields",
      "relevanceScore": 0.87
    },
    {
      "type": "invariant",
      "content": "Never expose stack traces in production error responses",
      "relevanceScore": 0.82
    }
  ]
}
```

## Approving Proposed Learnings

When your AI agent proposes a new learning, it appears in your ChorumAI dashboard:

1. Open ChorumAI web UI
2. Look for the **Pending Learnings** section in the sidebar
3. Review each proposal:
   - ✓ **Approve**: Add to project memory
   - ✏️ **Edit**: Modify before approving
   - ✗ **Deny**: Reject the proposal

## Security Considerations

- **Token Security**: Treat your API token like a password. Never commit it to version control.
- **HTTPS Only**: All communication uses HTTPS encryption.
- **Permission Scoping**: Tokens can be configured with read-only access or limited to specific projects.
- **Human-in-the-Loop**: All write operations (proposing learnings) require human approval before affecting your memory.

## Troubleshooting

### "Token not found or revoked"

Your token may have been revoked. Generate a new one in Settings → MCP Integration.

### Server not connecting

1. Verify the token is correctly set in your IDE's config
2. Check you're using the correct URL: `https://chorum.ai/api/mcp`
3. Ensure the `Authorization` header uses `Bearer ` prefix
4. Restart your IDE after configuration changes

### Tools not appearing

1. Restart your IDE after configuration changes
2. Check the IDE's MCP server logs for connection errors
3. Verify your token has not expired

### Local Development

For local development, use:

```json
{
  "mcpServers": {
    "chorum": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer chorum_xxxxxxxxxxxxx"
      }
    }
  }
}
```

## Need Help?

- Check the [ChorumAI documentation](https://chorum.ai/docs)
- Report issues at [GitHub](https://github.com/callmesparky42/ChorumAI/issues)
- Join our Discord community for support
