# Chorum AI: Marketing Strategy

> **North Star:** Make AI memory sovereign. Users own their context—providers are interchangeable performers. No ads. No surveillance. No enshittification.

---

## The Moment (January 2026)

OpenAI just introduced ads into ChatGPT. User searches "mexican recipes," gets served hot sauce ads. They say GPT isn't "listening." Sure.

Meanwhile:
- Claude has aggressive usage limits
- Gemini has... Gemini energy
- Every provider wants to own your context as their moat

**Chorum's position just became clearer:** We don't inject ads. We inject *your own context*. The only thing we're selling is sovereignty.

---

## The One-Liner

**"Your Context. Their Chorus."**

Every AI provider wants to own your memory. Chorum flips it: your interface remembers you, and the models are just voices in a chorus.

---

## Positioning

### What Chorum Is

A **sovereign context layer** that sits between you and every AI model you use. One conversation, any provider, your memory stays with you—encrypted, portable, yours.

### What Chorum Is Not

- Not another ChatGPT clone (it's the layer *above* the models)
- Not enterprise middleware (Portkey/LangChain serve that market)
- Not an IDE (that race is won—Cursor, Windsurf, Claude Code exist)
- Not trying to replace any AI (it makes them work together)

### The Thesis

We're building for the **"JEPA transition period"**—the window where LLMs are powerful but fundamentally limited by their lack of persistent learning. Chorum's semantic memory layer is bridge technology that makes current LLMs usable for serious work until the next paradigm shift arrives.

---

## Two Audiences, One Product

### Primary: The Web UI User

**Who they are:** Anyone who uses AI and is tired of:
- Repeating themselves ("I've told Claude this 47 times")
- Losing context when switching providers
- Being locked into one vendor's ecosystem
- Hitting rate limits mid-flow

**What they want:** "I want to use AI and not have a crappy experience because of usage limits, outages, privacy concerns, or lost conversations."

**They don't care about:** MCP, APIs, IDE integrations, Docker

**Entry point:** Web app at chorumai.com

---

### Secondary: The Developer (MCP Server Mode)

**Who they are:** Coders who use IDE agents (Claude Code, Cursor, Windsurf, Cline) and are frustrated that every session starts cold.

**What they want:** Their IDE agents to remember patterns, decisions, and project context across sessions—without being locked into any single provider's memory silo.

**The insight:** We won't be the next IDE. That race is won. But every IDE agent is **stateless by design**. Chorum already has the answer (relevance gating, learning types, encrypted memory). What's missing is the **bridge**—exposing this memory via MCP.

**Entry point:** `npx chorum-mcp` + API token from settings

**Strategic value:** Every IDE agent becomes a distribution channel, not a competitor.

---

## Core Value Propositions

### 0. No Ads. Ever.
ChatGPT now serves ads based on your conversations. Chorum injects exactly one thing: your own context. We don't monetize your attention. We don't "personalize" your experience with sponsored content. The interface is yours.

### 1. Provider Outages Don't Stop You
Claude goes down? Chorum auto-routes to GPT with full context. This is GitHub Issue #2944 (79+ upvotes) that Anthropic hasn't built.

### 2. Context That Actually Persists
Not "re-inject last 10 messages." Semantic memory that learns your patterns, decisions, and preferences—and knows when to surface them.

### 3. No Vendor Lock-In
Six months of Claude conversations? Export encrypted, import anywhere. Your memory is AES-256-GCM encrypted at rest, decrypted only when needed. You control the keys.

### 4. Cross-Provider Peer Review
Have Claude write code, GPT review it for security. Automated pair programming across providers.

### 5. Local Model Integration
First-class Ollama and LM Studio support. Same interface, same memory, zero cost, full privacy.

---

## The Paradigm Inversion

| Before | With Chorum |
|--------|-------------|
| Ads injected into your conversations | Zero ads, zero tracking, zero "personalization" |
| Your context locked in each provider's silo | Your context portable across all providers |
| Memory stored in their plaintext logs | Memory encrypted at rest, your keys |
| Hit a rate limit, lose your thread | Hit a limit, seamless failover with full context |
| One model's opinion | Peer review across models |
| They decide what you can access | You decide—cloud, local, or both |
| Export? What export? | One-click export, encrypted or plaintext |

---

## Validated Pain Points

**From the news (January 2026):**

> OpenAI introduces ads to ChatGPT. User searches "mexican recipes," receives hot sauce advertisement. OpenAI claims GPT isn't "listening."
> — Hard Fork Podcast

**From GitHub/Reddit:**

> "When usage limits are reached, Claude Code should detect the limit and offer a fallback option... The transition should be seamless, maintaining context and conversation history."
> — GitHub Issue #2944

> "Developer in active coding session: A developer is deep in debugging or implementing a feature when they hit their Pro subscription limit."
> — Same issue

> "Even at $200/month, you're just buying more throttled access, not control."
> — Northflank blog on Claude limits

---

## Brand

- **Domain:** chorumai.com
- **Colors:** Azure (#29ABE2), Yellow Gold (#F7C325)
- **Font:** Instrument Sans
- **Aesthetic:** Dark theme, professional, not "AI slop"
- **Tone:** Confident, technical, sovereignty-focused

---

## Monetization

**Philosophy:** Sovereign tools shouldn't have rent-seeking business models.

| Tier | What | Price |
|------|------|-------|
| **Free** | Full product, self-hosted | $0 |
| **Sponsor** | GitHub Sponsors / Ko-fi | $5-25/month |
| **Pro** | Team features (if demand emerges) | TBD |

**50% of donations go to World Central Kitchen.**

This solves a real problem for a narrow audience. Sustainable, not venture-scale.

---

## Audience Size (Honest Assessment)

**Web UI users:** Maybe 5,000-20,000 globally who:
- Actively manage multiple LLM subscriptions
- Care about cost optimization
- Want project-scoped memory
- Value data sovereignty

**MCP/Developer users:** A subset of the above who also:
- Use IDE agents daily
- Are comfortable with API keys and local tooling
- Want memory that persists across tools

This is a tool for power users. That's okay—lots of great software started as "I built this for myself."

---

## Distribution Channels

### Web UI
- chorumai.com (primary)
- GitHub repo (self-host option)
- Docker (planned, for sovereignty crowd)

### MCP Server Mode
- npm (`npx chorum-mcp`)
- VS Code extension marketplace (discoverability)
- "Works with Claude Code / Cursor / Windsurf" badges
- MCP server directories (as they emerge)

---

## Messaging by Scenario

### Scenario 1: Provider Outage
**Problem:** "What happens when Downdetector notifies you one of your AI providers is down?"
**Solution:** Configure providers once. When one goes down, Chorum auto-routes to the next—with full context intact.

### Scenario 2: Context Amnesia
**Problem:** "Always use Zod for validation." You've told Claude this 47 times this month.
**Solution:** The relevance gating system learns your patterns and auto-injects them when they matter.

### Scenario 3: Vendor Lock-In
**Problem:** Six months of Claude conversations. Now you want to try GPT-5. What happens to all that context?
**Solution:** Export encrypted, import anywhere. Models are interchangeable—you are the constant.

---

## Open Questions

1. **Discovery for MCP users:** How do Cursor/Claude Code users find out Chorum exists?
2. **Demos:** Video walkthroughs of each scenario?
3. **Testimonials:** Need real users to validate the value prop
4. **Pricing tiers:** Does "Pro" ever make sense, or is tip-jar sufficient?

---

## Success Metrics

**You'll know it's working when:**
1. Users report real cost savings (cheaper models handling 60-70% of requests)
2. Conversation flows naturally across providers without context loss
3. Budget alerts prevent unexpected bills
4. Peer review catches issues users would have missed
5. Projects demonstrably "get smarter" over time
6. Users ask for the GitHub link to share with others

---

*Last updated: 2026-01-24*
