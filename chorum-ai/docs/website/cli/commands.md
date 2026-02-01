---
title: CLI Commands
description: Reference for all Chorum CLI commands.
---

# CLI Commands Reference

Complete list of commands available in the H4X0R CLI.

## General

### `help`
Show help for a command.
```bash
chorum help [command]
```

### `version`
Show current CLI version.
```bash
chorum version
```

---

## Memory & Sovereignty

### `export`
Export your memory vault to an encrypted file.

```bash
chorum export [options]
```

**Options:**
- `--output <path>`: Specify output filename
- `--plaintext`: Export as decrypted Markdown (WARNING: Insecure)
- `--project <id>`: Export only a specific project

### `import`
Import a memory vault from a file.

```bash
chorum import <file>
```

**Interactive:** Prompts for decryption passphrase.

### `conflicts`
Manage merge conflicts from imports.

```bash
chorum conflicts
```

**Options:**
- `--resolve`: Start interactive resolution mode
- `--list`: List all pending conflicts

---

## MCP Integration

### `mcp config`
Display configuration for IDEs, including your API token.

```bash
chorum mcp config
```

### `mcp status`
Check the status of the local MCP server.

```bash
chorum mcp status
```

---

## Developer Tools

### `memory query`
Test a semantic search query against your memory.

```bash
chorum memory query "auth patterns" --project <id>
```

### `memory add`
Manually add a learning item.

```bash
chorum memory add --type pattern --content "Always use strict mode" --project <id>
```

---

## Related Documentation

- **[CLI Overview](./overview.md)** — Getting started
- **[Export/Import](../sovereignty/export-import.md)** — Detailed export guide
