# H4X0R CLI - Chorum Terminal Interface

```
██   ██ ██   ██ ██   ██  ██████  ██████  
██   ██ ██   ██  ██ ██  ██  ████ ██   ██ 
███████ ███████   ███   ██ ██ ██ ██████  
██   ██     ██   ██ ██  ████  ██ ██   ██ 
██   ██     ██  ██   ██  ██████  ██   ██ 
```

**Your sovereign context layer. Their chorus.**

The H4X0R CLI provides terminal access to your Chorum AI instance, enabling memory management, agent interactions, and project portability from the command line.

## Installation

### From npm (Coming Soon)
```bash
npm install -g @chorum/h4x0r
```

### From Source
```bash
cd h4x0r
npm install
npm run build
npm link
```

## Quick Start

### 1. Connect to Your Chorum Instance
```bash
chorum login --url http://localhost:3000
```

### 2. Check Status
```bash
chorum status
```

### 3. Ask the Chorus
```bash
chorum ask "How do I implement authentication in Next.js?"
```

## Core Commands

### `chorum ask [prompt...]`
Send a prompt to the chorus with full memory context.

**Options:**
- `-a, --agent <agent>` - Specify agent (analyst, architect, debugger, etc.)
- `-p, --project <project>` - Target specific project
- `-m, --model <model>` - Force specific model
- `--no-memory` - Disable memory injection

**Examples:**
```bash
# General query
chorum ask "What's the best way to handle form validation?"

# Use specific agent
chorum ask -a architect "Design a microservices architecture"

# Target specific project
chorum ask -p my-app "Review the authentication flow"
```

### Agent Shortcuts
Quick access to specialized agents:

```bash
chorum analyst "Analyze this error log"
chorum architect "Design a caching strategy"
chorum debugger "Why is this API call failing?"
chorum reviewer "Review this code for security issues"
chorum writer "Write documentation for this API"
chorum tutor "Explain how React hooks work"
chorum planner "Create a sprint plan for user authentication"
chorum researcher "Find best practices for GraphQL pagination"
```

### `chorum review`
Peer review code with cross-provider validation.

**Options:**
- `-f, --file <file>` - File to review
- `-d, --dir <directory>` - Directory to review
- `--focus <focus>` - Review focus: code, security, architecture, accuracy
- `--friend <provider>` - Force specific reviewer: anthropic, openai, google

**Examples:**
```bash
# Review a file
chorum review -f src/auth.ts

# Security-focused review
chorum review -d src/api --focus security

# Use specific provider for review
chorum review -f payment.ts --friend openai
```

## Memory Management

### `chorum memory list`
List memory items with filtering.

**Options:**
- `-p, --project <project>` - Filter by project
- `-t, --type <type>` - Filter by type: pattern, decision, invariant, fact
- `-n, --limit <n>` - Limit results (default: 20)

**Examples:**
```bash
# List all memory
chorum memory list

# List patterns for specific project
chorum memory list -p my-app -t pattern

# Show recent decisions
chorum memory list -t decision -n 10
```

### `chorum memory add <content>`
Add a memory item manually.

**Options:**
- `-t, --type <type>` - Type: pattern, decision, invariant, fact (default: pattern)
- `-p, --project <project>` - Target project
- `--domains <domains>` - Comma-separated domain tags

**Examples:**
```bash
# Add a pattern
chorum memory add "Always use Zod for validation" -t pattern

# Add an invariant
chorum memory add "Never expose API keys in client code" -t invariant

# Add with domains
chorum memory add "Use React Query for data fetching" --domains "react,api,state-management"
```

### `chorum memory search <query>`
Semantic search through memory.

**Options:**
- `-p, --project <project>` - Filter by project
- `-n, --limit <n>` - Limit results (default: 10)

**Examples:**
```bash
# Search for validation patterns
chorum memory search "form validation"

# Search within project
chorum memory search "authentication" -p my-app
```

### `chorum memory delete <id>`
Delete a memory item.

**Options:**
- `--force` - Skip confirmation

**Examples:**
```bash
# Delete with confirmation
chorum memory delete abc123

# Force delete
chorum memory delete abc123 --force
```

### `chorum memory repair`
Backfill missing embeddings for memory items.

**Options:**
- `-p, --project <project>` - Target specific project

**Examples:**
```bash
# Repair all projects
chorum memory repair

# Repair specific project
chorum memory repair -p my-app
```

## Knowledge Import/Export

### `chorum import-knowledge <file>`
Import knowledge from JSON/YAML file.

**Options:**
- `-p, --project <project>` - Target project
- `-t, --type <type>` - Override type for all items
- `--dry-run` - Preview without importing

**File Format:**
```json
{
  "patterns": [
    {
      "content": "Always use safeParse() over parse()",
      "domains": ["validation", "error-handling"]
    }
  ],
  "decisions": [
    {
      "content": "Use React Hook Form for state management",
      "rationale": "Better DX, smaller bundle size"
    }
  ],
  "invariants": [
    {
      "content": "Never expose raw Zod errors to users",
      "severity": "ERROR"
    }
  ]
}
```

**Examples:**
```bash
# Import knowledge
chorum import-knowledge ./knowledge.json -p my-app

# Preview import
chorum import-knowledge ./knowledge.yaml --dry-run
```

### `chorum export`
Export memory to encrypted archive.

**Options:**
- `-p, --project <project>` - Export specific project
- `-o, --output <file>` - Output file path
- `--plaintext` - Export as plaintext (DANGEROUS)

**Examples:**
```bash
# Export project
chorum export -p my-app -o my-app-backup.chorum

# Export all projects
chorum export -o full-backup.chorum

# Plaintext export (not recommended)
chorum export -p my-app --plaintext -o backup.json
```

### `chorum import <file>`
Import memory from archive.

**Options:**
- `--merge` - Merge with existing memory
- `--replace` - Replace existing memory

**Examples:**
```bash
# Import and merge
chorum import my-app-backup.chorum --merge

# Replace existing
chorum import my-app-backup.chorum --replace
```

## Configuration

### `chorum login`
Authenticate with Chorum server.

**Options:**
- `-u, --url <url>` - Server URL

**Examples:**
```bash
# Login to local instance
chorum login --url http://localhost:3000

# Login to production
chorum login --url https://chorum.example.com
```

### `chorum config <action> [key] [value]`
Manage configuration.

**Actions:**
- `list` - Show all configuration
- `get <key>` - Get specific value
- `set <key> <value>` - Set configuration value

**Examples:**
```bash
# List all config
chorum config list

# Get API URL
chorum config get apiUrl

# Set default project
chorum config set activeProject my-app
```

### `chorum status`
Show connection and vault status.

**Example:**
```bash
chorum status
```

**Output:**
```
╔══════════════════════════════════════════════════════════╗
║  CONNECTION STATUS                                       ║
╠══════════════════════════════════════════════════════════╣
║  Server URL:      http://localhost:3000                  ║
║  Connection:      ACTIVE                                 ║
║  Vault Status:    UNLOCKED                               ║
║  Memory Items:    142                                    ║
║  Active Project:  my-app                                 ║
╚══════════════════════════════════════════════════════════╝
```

## MCP Server

### `chorum mcp <action>`
MCP Server management for external AI agents (Claude Desktop, Cursor, etc.).

**Actions:**
- `serve` - Start MCP server
- `status` - Check server status
- `config` - Show MCP configuration

**Options:**
- `-p, --port <port>` - HTTP port (for future use)

**Examples:**
```bash
# Start MCP server
chorum mcp serve

# Check status
chorum mcp status

# Show configuration
chorum mcp config
```

## Visual Modes

### CRT Mode
Enable CRT scanline effect for authentic terminal aesthetics:
```bash
chorum --crt ask "Hello world"
```

### Amber Mode
Use amber phosphor color scheme:
```bash
chorum --amber status
```

### Combined
```bash
chorum --crt --amber ask "Maximum retro"
```

## Environment Variables

- `CHORUM_API_URL` - Default API URL
- `CHORUM_API_TOKEN` - Authentication token
- `CHORUM_CONFIG_PATH` - Custom config file location

## Configuration File

Located at `~/.chorum/config.json`:

```json
{
  "apiUrl": "http://localhost:3000",
  "apiToken": "your-token-here",
  "activeProject": "my-app",
  "vaultUnlocked": false,
  "memoryCount": 142
}
```

## Tips & Tricks

### Pipe Output
```bash
# Save response to file
chorum ask "Explain async/await" > explanation.md

# Use with other tools
chorum memory list -t pattern | grep "validation"
```

### Batch Operations
```bash
# Import multiple knowledge files
for file in knowledge/*.json; do
  chorum import-knowledge "$file" -p my-app
done
```

### Quick Project Switch
```bash
# Set active project
chorum config set activeProject frontend

# Now all commands use this project by default
chorum memory list
chorum ask "What are our coding standards?"
```

## Troubleshooting

### Connection Issues
```bash
# Check status
chorum status

# Re-login
chorum login --url http://localhost:3000
```

### Memory Not Surfacing
```bash
# Repair embeddings
chorum memory repair

# Check memory exists
chorum memory list -p your-project
```

### Performance
```bash
# Limit memory injection
chorum ask "question" --no-memory

# Use specific model for faster responses
chorum ask "quick question" -m gpt-4o-mini
```

## Development

### Build from Source
```bash
git clone https://github.com/ChorumAI/chorum-ai.git
cd chorum-ai/h4x0r
npm install
npm run build
```

### Run in Dev Mode
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

## License

MIT - See LICENSE file for details

## Support

- GitHub Issues: https://github.com/ChorumAI/chorum-ai/issues
- Documentation: https://docs.chorumai.com
- Discord: https://discord.gg/chorumai
