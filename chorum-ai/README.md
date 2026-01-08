# Chorum AI

**Multi-provider LLM orchestration with intelligent agent routing, cost optimization, and peer review.**

Chorum is an AI chat application that intelligently routes requests across multiple LLM providers (Claude, GPT-4, Gemini), optimizes for cost and capability, and provides a unique "Phone a Friend" peer review system where one LLM reviews another's work.

## Features

### Multi-Provider LLM Router

Chorum's intelligent router automatically selects the best LLM provider based on:

- **Task Type Detection**: Automatically infers task type (deep reasoning, code generation, structured output, vision analysis)
- **Capability Matching**: Routes to providers with the required capabilities
- **Budget Management**: Tracks daily spend per provider and respects budget limits
- **Cost Optimization**: Selects the most cost-effective provider that can handle the task
- **Manual Override**: Users can force a specific provider when needed

**Supported Providers:**
- Anthropic (Claude 3.5 Sonnet)
- OpenAI (GPT-4 Turbo)
- Google (Gemini 1.5 Pro)

### Agent Orchestration System

A three-tier agent system with 14 built-in agents, each with specialized roles and behaviors:

**Reasoning Tier** (Quality-first for complex analysis)
- **Analyst** - Identifies patterns, draws conclusions, builds logical frameworks
- **Architect** - Designs systems, evaluates tradeoffs, plans technical approaches
- **Code Reviewer** - Reviews code for quality, security, maintainability
- **Debugger** - Diagnoses issues, traces root causes, proposes fixes

**Balanced Tier** (Versatile for most tasks)
- **Researcher** - Gathers, validates, and synthesizes information
- **Writer** - Transforms ideas into clear, engaging prose
- **Editor** - Refines content for clarity, flow, and correctness
- **Copywriter** - Creates persuasive, action-oriented content
- **Fact Checker** - Validates claims against authoritative sources
- **Planner** - Breaks down goals into actionable tasks
- **Translator** - Converts between languages, formats, or technical levels
- **Tutor** - Explains concepts, guides learning

**Fast Tier** (Speed-first for simple tasks)
- **Summarizer** - Distills content to essential meaning
- **Coordinator** - Orchestrates workflows, routes tasks

Each agent has:
- Distinct persona and tone
- Semantic focus (the question it asks of memory)
- Model configuration (temperature, token limits, reasoning mode)
- Capabilities and boundaries
- Guardrails and escalation paths

### Custom Agent Creation

Create your own agents through the UI with:
- Custom name, icon, and role
- Tier selection (Reasoning/Balanced/Fast)
- Persona configuration (description, tone, principles)
- Memory settings (semantic focus, context files, writeback targets)
- Capabilities and boundaries
- Custom guardrails (plus 5 enforced guardrails on all agents)

Custom agents are automatically saved to `.chorum/agents/` as markdown files.

### Phone a Friend (Peer Review)

A unique cross-provider review system where one LLM reviews another's work:

- **Cross-Provider Review**: If Claude generates a response, GPT-4 or Gemini reviews it
- **Focus Areas**: Code, Security, Architecture, Accuracy, or General review
- **Structured Feedback**: Issues categorized by severity (critical, warning, suggestion)
- **Memory Writeback**: Learned patterns are saved to project memory for future use
- **Cost Tracking**: Shows review cost alongside original response cost

### Semantic Memory System

A "Write Path" for memory that learns from every interaction, going beyond simple message history:
- **Pattern Analyzer**: Background process that extracts coding patterns, architectural decisions, and project invariants.
- **Context Injector**: Intelligently injects relevant learned patterns into the system prompt based on current context.
- **Invariants**: Defines rules that must *never* be violated (e.g., "Always validate inputs"), enforced by the Validator.
- **Project Wisdom**: `.chorum/memory/` stores evolving project knowledge as markdown, making it readable by both humans and agents.

### Security & Privacy

Enterprise-grade security features designed for data protection:
- **PII Anonymization**: Automatically detects and redacts personal identifiable information before it leaves your machine.
- **Audit Logs**: Comprehensive logging of all LLM interactions, including provider, model, cost, and security flags.
- **HTTPS Enforcement**: Strict validation for all provider endpoints to prevent insecure data transmission.
- **Strict SSL**: Enforces valid SSL certificates, rejecting self-signed certs (configurable).

### Resilient Fallbacks & Local Models

Chorum ensures your work never stops due to provider outages:
- **Smart Fallback Chain**: If your primary provider (e.g., Claude) fails, requests automatically retry with the next best option (e.g., GPT-4).
- **BYOLLM (Bring Your Own LLM)**: Full support for local models via **Ollama** and **LM Studio**.
- **Offline Mode**: Seamlessly switch to local models when internet connectivity is lost or for maximum privacy.


### Cost Tracking

- **Per-Message Costs**: See exactly what each response costs
- **Session Totals**: Running cost meter in the header
- **Provider Usage Logging**: All usage tracked in database for analysis
- **Daily Budgets**: Set spending limits per provider

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: NextAuth.js (OAuth support)
- **State**: Zustand with persistence
- **Styling**: Tailwind CSS
- **LLM SDKs**: Anthropic, OpenAI, Google Generative AI

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase recommended)
- At least one LLM API key (Anthropic, OpenAI, or Google)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ChorumAI/chorum-ai.git
cd chorum-ai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
# Database
DATABASE_URL=postgresql://...

# Auth
AUTH_SECRET=your-auth-secret
GITHUB_ID=your-github-oauth-id
GITHUB_SECRET=your-github-oauth-secret

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Encryption
ENCRYPTION_KEY=32-byte-hex-key
```

4. Set up the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access Chorum.

### Database Commands

```bash
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema directly (dev)
npm run db:studio    # Open Drizzle Studio
```

## Project Structure

```
chorum-ai/
├── .chorum/                    # Agent orchestration config
│   ├── ARCHITECTURE.md         # System design documentation
│   ├── agents/                 # Agent definitions (markdown)
│   │   ├── _schema.md          # Agent definition schema
│   │   ├── analyst.md          # Built-in agents...
│   │   └── ...
│   ├── memory/                 # Project memory
│   │   ├── project.md          # Project context
│   │   ├── patterns.md         # Learned patterns
│   │   └── decisions.md        # Decision log
│   └── orchestration/          # Routing & workflows
│       ├── routing.md
│       ├── workflows.md
│       └── guardrails.md
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── agents/         # Agent CRUD
│   │   │   ├── chat/           # Main chat endpoint
│   │   │   ├── memory/         # Memory writeback
│   │   │   ├── providers/      # Provider config
│   │   │   ├── projects/       # Project management
│   │   │   └── review/         # Peer review endpoint
│   │   ├── login/
│   │   ├── settings/
│   │   └── page.tsx            # Main chat UI
│   ├── components/
│   │   ├── AgentPanel.tsx      # Agent selection sidebar
│   │   ├── AgentCreatorModal.tsx
│   │   ├── ChatPanel.tsx       # Main chat interface
│   │   ├── Message.tsx         # Message display
│   │   ├── PeerReview.tsx      # Review display
│   │   └── ...
│   └── lib/
│       ├── agents/             # Agent types & store
│       ├── chorum/             # Router, memory, summarize
│       ├── db/                 # Database schema
│       ├── review/             # Review types & store
│       └── store.ts            # Main Zustand store
└── drizzle/                    # Database migrations
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/chat` | POST | Send message, get LLM response |
| `/api/agents` | GET/POST | List/create agents |
| `/api/agents/[name]` | DELETE | Delete custom agent |
| `/api/review` | POST | Request peer review |
| `/api/memory/patterns` | GET/POST | Read/write learned patterns |
| `/api/providers` | GET/POST | Manage provider credentials |
| `/api/projects` | GET/POST | Manage projects |

## Configuration

### Provider Settings

Configure providers in Settings (`/settings`):
- Add API keys for each provider
- Set daily budgets
- Configure model preferences
- View usage statistics

### Agent Customization

Agents can be customized via:
1. **UI**: Click "Create Agent" in the Agent Panel
2. **Markdown**: Edit files in `.chorum/agents/`

### Enforced Guardrails

All agents (built-in and custom) must follow these guardrails:
1. Show reasoning for decisions
2. Flag uncertainty explicitly
3. Never fabricate information
4. Respect human checkpoints
5. Log all significant actions

## Architecture

### Router Decision Flow

```
User Message
    ↓
Task Type Inference (code, reasoning, general, etc.)
    ↓
Capability Matching (filter capable providers)
    ↓
Budget Filtering (exclude over-budget providers)
    ↓
Cost Optimization (select cheapest capable)
    ↓
Provider Invocation
```

### Agent Selection Flow

```
User selects Agent from panel
    ↓
Agent tier determines model preferences
    ↓
Semantic focus shapes memory extraction
    ↓
Persona and guardrails shape response
    ↓
Learned patterns write back to memory
```

### Peer Review Flow

```
Response generated by Provider A
    ↓
User clicks "Get second opinion" OR auto-review enabled
    ↓
Provider B reviews (always different from A)
    ↓
Issues parsed and displayed by severity
    ↓
Learned patterns saved to .chorum/memory/patterns.md
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details.

---

Built with intelligence, not just tokens.
