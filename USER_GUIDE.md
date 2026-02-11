# Chorum AI User Guide
**Version 1.0**

Welcome to Chorum AI, an intelligent LLM orchestration platform that routes your requests to the best available AI provider while learning from your projects over time.

This guide covers everything from first setup to advanced features you may not see in the interface but that work behind the scenes to make your experience better.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Interface](#the-interface)
3. [Projects](#projects)
4. [Conversations](#conversations)
5. [Providers and Models](#providers-and-models)
6. [Agents](#agents)
7. [The Learning System](#the-learning-system)
8. [Settings](#settings)
9. [Security and Privacy](#security-and-privacy)
10. [Behind the Scenes](#behind-the-scenes)
11. [Environment Configuration](#environment-configuration)
12. [Troubleshooting](#troubleshooting)

---

## Getting Started

When you first launch Chorum AI, you'll be guided through an onboarding wizard. This process helps you configure the essentials before you start chatting.

### The Onboarding Steps

**1. Welcome**
A brief introduction to what Chorum AI can do for you.

**2. Environment Setup**
The system checks that your environment is properly configured. It validates:
- Database connection details
- Encryption keys for securing your API credentials
- Authentication secrets for session management

**3. Database Connection**
Tests your PostgreSQL database connection and runs any necessary migrations. Your data is stored locally in your own database, not on third party servers.

**4. Provider Configuration**
This is where you add your LLM provider API keys. Chorum supports multiple providers including:
- Anthropic (Claude)
- OpenAI (GPT models)
- Google (Gemini)
- Mistral AI
- DeepSeek
- Perplexity
- xAI (Grok)
- GLM
- Local providers like Ollama and LM Studio

You can add as many providers as you have access to. The more providers you configure, the more routing options Chorum has when optimizing for cost, quality, or capability.

**5. Preferences**
Set your initial preferences including your bio (which gets included in prompts to personalize responses), security settings, and memory preferences.

**6. Complete**
You're ready to go. The wizard will take you to the main chat interface.

---

## The Interface

Chorum uses a three panel layout that you can resize to fit your workflow.

### Left Panel: Sidebar

The sidebar shows:
- **Your Projects** listed by name. Click a project to switch to it.
- **Conversation History** for the current project, showing a preview of each conversation.
- **New Conversation** button to start fresh within the current project.

### Center Panel: Chat

This is where the conversation happens. You'll see:
- Your messages and the AI responses
- Which provider generated each response (shown subtly)
- Token counts and costs if you have those enabled
- Support for images in your messages

### Right Panel: Agent Panel

This collapsible panel shows:
- The currently selected agent (or Auto for intelligent routing)
- Information about why an agent was chosen
- Confidence scores for the selection
- The agent's capabilities and specialty

You can collapse this panel if you prefer a simpler view.

---

## Projects

Projects are containers that group related conversations together. Each project maintains its own learning history, so Chorum gets smarter about each project independently.

### Creating a Project

When you create a project, you can provide:

**Name** (required)
Give it something descriptive. "Mobile App Rewrite" or "API Documentation" work better than "Project 1".

**Description**
A brief explanation of what this project is about. This helps Chorum understand context when routing your requests.

**Tech Stack**
List the technologies involved. If you're working on a React Native app with a Node backend, add those here. This context gets injected into prompts when relevant.

**Custom Instructions**
Any special instructions that should apply to all conversations in this project. For example: "Always use TypeScript. Prefer functional components. Avoid any deprecated APIs."

### Project Learning

As you work within a project, Chorum learns from your interactions. It picks up:
- Patterns that work well
- Approaches to avoid
- Important decisions you've made
- Rules that should always be followed
- Optimal sequences for common tasks

This learning is project specific. What Chorum learns about your frontend project won't bleed into your data science project.

---

## Conversations

Within each project, you can have multiple conversations. Each conversation maintains its own history and context.

### Starting Fresh

Click "New Conversation" to start with a clean slate. Your previous conversations are preserved and accessible from the sidebar.

### Conversation Titles

Chorum automatically generates a title for each conversation based on your first message. You don't need to name them manually.

### Message History

All messages are stored with:
- Timestamps
- The provider and model that generated responses
- Token counts (input and output)
- Cost tracking if you have it enabled

### Images

You can include images in your messages. Chorum will send them to providers that support vision capabilities. If the selected provider doesn't support images, Chorum will route to one that does.

---

## Providers and Models

Chorum is designed to work with multiple AI providers simultaneously.

### Adding Providers

From Settings, you can add provider credentials. For each provider you'll specify:

**API Key**
Your API key from the provider. This is encrypted before being stored in your database using AES encryption.

**Model**
Which model to use from that provider. For example, with Anthropic you might choose claude-sonnet-4 or claude-opus-4.

**Daily Budget** (optional)
Set a spending limit per day. Once exceeded, Chorum will route around this provider until the next day.

**Capabilities**
Tag what this provider is good at. Options include:
- Deep reasoning
- Code generation
- Bulk processing
- Structured output
- Vision analysis

**Cost per 1M Tokens**
Set the input and output cost so Chorum can estimate expenses accurately.

### Local Providers

Chorum supports local LLM servers:

**Ollama**
Point Chorum at your Ollama instance. It will auto detect available models.

**LM Studio**
Works similarly to Ollama. Great for running models offline.

**OpenAI Compatible**
Any server that speaks the OpenAI API format can be added with a custom base URL.

### How Routing Works

When you send a message, Chorum's router analyzes it and selects the best provider. The decision considers:

1. **What the task needs**: Is this a coding question? Does it require deep reasoning? Is it simple enough for a fast model?

2. **Provider capabilities**: Which providers can handle this type of task?

3. **Budget status**: Has any provider exceeded its daily limit?

4. **Quality ranking**: When multiple providers qualify, Chorum has a default quality order but learns your preferences over time.

5. **Cost estimation**: How much will each option cost?

You can always override the automatic selection by manually choosing a provider before sending your message.

### Fallback Behavior

If the primary provider fails (API error, rate limit, downtime), Chorum automatically tries alternatives. You can configure fallback behavior in Settings:

- Enable or disable automatic fallback
- Set a default provider preference
- Configure a local fallback model for offline situations
- Customize the priority order

---

## Agents

Agents are specialized personas that approach problems differently. Each agent has its own style, expertise area, temperature setting, and guardrails.

### Built in Agents

Chorum ships with 14 agents organized into three tiers:

**Reasoning Tier** (for complex analysis)

| Agent | Specialty |
|-------|-----------|
| Analyst | Pattern recognition, logical frameworks, tradeoff analysis |
| Architect | System design, technical planning, architectural decisions |
| Code Reviewer | Quality checks, security review, maintainability assessment |
| Debugger | Issue diagnosis, root cause analysis, fix proposals |

**Balanced Tier** (versatile, everyday tasks)

| Agent | Specialty |
|-------|-----------|
| Researcher | Information gathering, source validation, synthesis |
| Writer | Drafting content, adapting tone, narrative structure |
| Editor | Refining clarity, fixing grammar, ensuring consistency |
| Copywriter | Persuasive content, CTAs, marketing copy |
| Fact Checker | Claim verification, source checking, confidence rating |
| Planner | Task breakdown, dependency mapping, risk identification |
| Translator | Language conversion, technical level adaptation |
| Tutor | Concept explanation, analogies, learning guidance |

**Fast Tier** (quick, simple tasks)

| Agent | Specialty |
|-------|-----------|
| Summarizer | Content distillation, key point extraction |
| Coordinator | Workflow orchestration, task routing |

### Agent Selection

When "Auto" is selected, Chorum analyzes your message and picks the most appropriate agent. It considers:
- What you're asking for
- The project context
- Previous conversation history
- Agent capabilities and specialties

The Agent Panel shows which agent was selected and why, along with a confidence score.

### Manual Selection

You can override auto selection by picking a specific agent from the Agent Panel. Your selection applies to that message only unless you keep it selected.

### Custom Agents

You can create your own agents with:
- Custom persona and personality
- Specific temperature settings
- Defined capabilities
- Guardrails and boundaries
- Tool access permissions

---

## The Learning System

One of Chorum's most powerful features is its ability to learn from your projects over time. This happens mostly in the background without you needing to do anything.

### What Chorum Learns

**Patterns**
Approaches that work well. If you consistently prefer certain coding styles or solution structures, Chorum picks up on that.

**Antipatterns**
Things to avoid. When you correct the AI or reject suggestions, Chorum learns what not to do.

**Decisions**
Important choices you've made. Technical decisions, architectural choices, and preferences become part of the project knowledge.

**Invariants**
Rules that must always hold. "Never modify the core auth module directly" or "All API responses must include a timestamp" become enforced guidelines.

**Golden Paths**
Optimal sequences for common tasks. The best way to add a new feature, the right order for migrations, preferred deployment steps.

### How Learning Works

**Automatic Extraction**
After each exchange, Chorum analyzes the conversation for learnable insights. This happens in the background (async mode by default) so it doesn't slow down your chat.

**Semantic Storage**
Learning items are stored with embeddings, allowing Chorum to retrieve relevant knowledge based on meaning, not just keywords.

**Context Injection**
When you ask something, Chorum checks if any learned items are relevant and includes them in the context sent to the AI.

**Response Validation**
Responses are checked against learned invariants. If the AI suggests something that violates a rule you've established, Chorum can flag it.

### Controlling the Learning System

From Settings, you can configure:

**Auto Learn**
Toggle whether Chorum automatically extracts learnings. Default is on.

**Learning Mode**
- Sync: Process learnings immediately (adds a bit of latency)
- Async: Queue learnings for background processing (default)

**Inject Context**
Whether to include relevant learnings in prompts. Default is on.

**Auto Summarize**
Older conversations can be automatically summarized to manage context length. The summaries preserve key information while reducing token usage.

**Validate Responses**
Check AI responses against learned invariants. Default is on.

**Smart Agent Routing**
Use the orchestration system to pick agents intelligently. Default is on.

### Confidence Scores

Each project has a confidence score that reflects how reliable the learning is. The score:
- Starts at 100%
- Decays slowly over time if the project isn't active
- Increases when validations pass
- Decreases when issues occur

---

## Settings

Access Settings from the sidebar to configure your Chorum experience.

### Profile

**Name**
Your display name.

**Email**
Your email address.

**Bio**
A description of yourself that gets included in prompts. This helps personalize responses. For example: "I'm a senior backend engineer working primarily in Go and Rust. I prefer explicit error handling over exceptions."

### Security

**Enforce HTTPS**
Require secure connections when communicating with providers. Recommended to keep on.

**Anonymize PII**
Automatically detect and mask personally identifiable information before sending to providers. Useful if you're working with sensitive data.

**Strict SSL**
Enforce strict certificate validation. May need to disable for local providers with self signed certificates.

**Log All Requests**
Enable comprehensive audit logging. Every request to providers is recorded with timestamps, costs, and metadata.

### Fallback

**Enable Fallback**
Allow automatic failover when a provider has issues.

**Default Provider**
Which provider to prefer when multiple options are equally suitable.

**Local Fallback Model**
A model running on your machine to use when all cloud providers are unavailable.

**Priority Order**
Custom ordering of providers for fallback selection.

### Memory

**Auto Learn**
Toggle automatic learning extraction.

**Learning Mode**
Sync or async processing.

**Inject Context**
Include learnings in prompts.

**Auto Summarize**
Summarize old conversations automatically.

**Validate Responses**
Check responses against invariants.

**Smart Agent Routing**
Enable intelligent agent selection.

---

## Security and Privacy

### Data Storage

Your data stays in your database. Chorum doesn't send your conversations or learning data anywhere except to the LLM providers you've configured.

### API Key Encryption

All provider API keys are encrypted with AES before storage. The encryption key is stored separately in your environment variables, not in the database.

### PII Protection

When PII anonymization is enabled, Chorum scans outgoing messages for:
- Email addresses
- Phone numbers
- Social security numbers
- Credit card numbers
- Other common PII patterns

Detected items are masked before being sent to providers.

### Audit Trail

With request logging enabled, you get a complete record of:
- Every LLM request (when, to which provider, which model)
- Security checks performed
- Costs and token counts
- Any security warnings or issues

---

## Behind the Scenes

These features work automatically without you needing to configure or think about them.

### Automatic Title Generation

When you start a new conversation, Chorum generates a title based on your first message. This happens asynchronously so it doesn't delay your response.

### Cost Tracking

Every message tracks:
- Input tokens (what you sent)
- Output tokens (what came back)
- Cost in USD based on provider pricing

This data is stored per message and aggregated to enforce daily budgets.

### Message Archiving

When auto summarization is enabled, older messages in long conversations get archived after being summarized. This keeps context windows manageable while preserving the information.

### Provider Health Checking

Chorum monitors provider responses and tracks errors. Providers with repeated failures get temporarily deprioritized in routing decisions.

### Embedding Generation

Learning items are converted to vector embeddings using a local model (all-MiniLM-L6-v2). This enables semantic search and relevance matching without sending your data to external services.

### Token Estimation

Before sending requests, Chorum estimates token counts to predict costs and ensure messages fit within model context limits.

### Experiment Framework

Chorum includes an A/B testing framework for routing strategies. Different routing approaches can be tested to optimize for cost, quality, or other metrics.

---

## Environment Configuration

Chorum requires several environment variables to be set.

### Required Variables

```
DATABASE_URL
```
PostgreSQL connection string. Example:
`postgresql://user:password@localhost:5432/chorum`

```
ENCRYPTION_KEY
```
64 character hex string (32 bytes) for AES encryption of API keys.

```
AUTH_SECRET
```
Base64 encoded secret for session management.

### Optional Variables

```
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_AI_API_KEY
```
Provider API keys as fallback when no user credentials are configured.

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```
For Google OAuth authentication.

```
NEXTAUTH_URL
```
Your application URL for authentication callbacks.

### Generating Secrets

The onboarding wizard can generate secure values for `ENCRYPTION_KEY` and `AUTH_SECRET` if you don't have them.

---

## Troubleshooting

### Provider Not Working

1. Check that your API key is correct
2. Verify the provider's service status
3. Check your daily budget hasn't been exceeded
4. Look at audit logs for specific error messages
5. Try the provider's API directly to isolate the issue

### Responses Are Slow

1. Check your selected model. Larger models are slower.
2. Consider enabling async learning mode if using sync
3. Long conversations accumulate context. Start fresh if needed.
4. Local providers depend on your hardware capabilities

### Learning Seems Off

1. Check that auto learn is enabled in Settings
2. Review the learning items for the project
3. Confidence decay may have reduced relevance of old learnings
4. Try adding explicit invariants for critical rules

### Database Connection Issues

1. Verify DATABASE_URL is correct
2. Ensure PostgreSQL is running
3. Check that the database exists
4. Run migrations if tables are missing

### Authentication Problems

1. Verify AUTH_SECRET is set correctly
2. Check session cookie settings
3. Ensure NEXTAUTH_URL matches your domain

---

## Quick Reference

### Keyboard Shortcuts

The interface supports standard text editing shortcuts in the message input.

### API Endpoints

For developers who want to integrate with Chorum:

| Endpoint | Purpose |
|----------|---------|
| POST /api/chat | Send a message and get a response |
| GET /api/projects | List your projects |
| GET /api/conversations | List conversations in a project |
| GET /api/providers | List configured providers |
| GET /api/learning | Retrieve project learning items |
| GET /api/settings | Get your settings |
| PATCH /api/settings | Update your settings |

### Data Export

You can export a complete project including all conversations, messages, and learning items via the export API. This creates a JSON file you can use for backup or migration.

---

## Getting Help

If you run into issues not covered here, check:
1. The audit logs for specific error information
2. Your environment variable configuration
3. Provider documentation for API specific issues

---

*Chorum AI v1.0*
