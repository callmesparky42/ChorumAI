# Chorum 2.0: Architecture Vision

**Version:** 0.3  
**Date:** February 21, 2026  
**Status:** Planning

---

## The Shift

**Chorum 1.0** was a router that learned.  
**Chorum 2.0** is a cognitive backend that routes.

The knowledge graph moves from "feature" to "foundation." Everything else orbits around it.

---

## Core Thesis

> Every interaction with an LLM is an opportunity to learn. Every future interaction should benefit from that learning. The system that mediates this loop is the product — not the chat interface, not the agents, not the routing. The loop.

---

## Nomenclature

| Term | Role |
|------|------|
| **Podium** | The cognitive scaffold — relevance scoring, context injection, tiered compilation |
| **Conductor** | The feedback loop — outcome tracking, confidence adjustment, self-improvement |
| **Zettelkasten / Nebula** | The persistent knowledge graph — learnings as nodes, relationships as edges |
| **Context Scopes** | Tag-based boundaries (replaces rigid "projects" at data layer) |
| **Projects** | UI-level saved filters over context scopes (human mental model preserved) |
| **chorumd** | The daemon — MCP server interface that any client can connect to |

---

## Design Principles

### 1. The Graph is the Product

The Zettelkasten is the persistent substrate. Apps come and go. Interfaces evolve. Models get replaced. The graph endures.

**Implication:** Every architectural decision asks "how does this strengthen or weaken the graph?"

### 2. Binary Star Core (Podium + Conductor)

**Podium:** What to inject, when, and how much. The scaffold that shapes what the model sees.

**Conductor:** What worked, what didn't, and what to adjust. The feedback that makes the scaffold smarter.

They orbit each other. Inseparable. Both read from and write to the Nebula.

```
Podium injects context → Model responds → Conductor evaluates
       ↑                                         │
       └──────────── Adjustments ────────────────┘
```

### 3. Attention Economy (Not Token Economy)

Context windows are exploding. Costs are dropping. The constraint is **attention**, not tokens.

The question isn't "can we afford to inject this?" but "will this help or dilute focus?"

**Implication:** Injection optimizes for **salience** and **signal-to-noise ratio**, not budget math. Budget tiers still exist for federation but aren't the primary optimization target.

### 4. Conductor Proposes, Human Disposes

Feedback signals:

| Type | Mechanism | Confidence Impact |
|------|-----------|-------------------|
| **Explicit** | 👍/👎 thumbs | High adjustment |
| **Implicit** | LLM-as-judge on conversation trajectory | Low adjustment, queued for review |
| **Inaction** | No response to proposed change after N days | Implicit approval |

The Conductor uses a background evaluation layer (cheap/local model) to continuously assess outcomes and propose confidence adjustments. Humans override, not annotate.

### 5. MCP as Core Contract

Chorum is a daemon, not just an app. The UI is one client among many.

```
IDE (Cursor) ────────► MCP ────────► chorumd
CLI (Claude Code) ───► MCP ────────► chorumd
Voice (Musings) ─────► MCP ────────► chorumd
Chat (Chorum UI) ────► MCP ────────► chorumd
```

**Already built:** MCP integration exists in 1.0 (see screenshot). 2.0 elevates it from "integration" to "primary interface."

**MCP Tools Exposed:**
- `read_nebula` — query context by scope/relevance
- `inject_learning` — add new learning to graph
- `submit_feedback` — record outcome signal
- `get_context` — retrieve compiled context for injection

### 6. Context Scopes Replace Rigid Projects

At the data layer: Learnings are **tagged**, not owned by projects.

At the UI layer: Projects are **saved filters** over context scopes.

```
Data: Learning → tagged with #python, #trading, #personal
UI: "Options Project" = filter where #python AND #trading
```

**Benefits:**
- A learning tagged `#python` is visible anywhere `#python` is in scope
- No "graduation" problem — relevance weights strengthen as learnings appear in multiple scopes
- Cross-project insights emerge naturally

### 7. Capture Surfaces are Disposable

Chat, voice, API, CLI — entry points, not product. They should be:
- Cheap to build
- Easy to replace
- Stateless (all state lives in the core)

**Implication:** No business logic in the UI layer. Ever.

### 8. Layers Have Contracts

Each layer exposes a defined interface to the layer above it. Inner layers know nothing about outer layers.

```
Zettelkasten → knows nothing about Podium
Podium → knows nothing about Agents
Agents → knows nothing about UI
```

**Implication:** You can swap any outer layer without touching inner layers.

### 9. Plan for Federation

Token/attention budgets scale with deployment:

| Tier | Context Budget | Use Case |
|------|---------------|----------|
| **Local** | Minimal | Offline-capable, privacy-max |
| **Personal** | Moderate | Individual user, cost-conscious |
| **Team** | Higher | Shared context, amortized cost |
| **Enterprise** | Large | Governance, audit trails, compliance |

Schema supports `user_id` AND `team_id` from day one.

### 10. Sovereignty by Default

User data is:
- Encrypted at rest
- Never leaves their control (unless they choose sync)
- Portable (export everything, import anywhere)

**Implication:** No features require providers to see user context.

### 11. Self-Improvement Has Guardrails

The Conductor can adjust weights, thresholds, and priorities. It cannot:
- Delete learnings without consent
- Promote unverified extractions beyond threshold
- Override user-pinned items

**Implication:** Automation proposes, human disposes.

### 12. The System Explains Itself

Every injection is auditable:
- Why was this included?
- What was the score?
- What was excluded and why?

**Implication:** Observability isn't a feature — it's a requirement. No black boxes.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      SHELL LAYER                            │
│              (UI, CLI, Voice, External Clients)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   AGENT LAYER                         │  │
│  │        (Personas, task-specific tuning, guardrails)   │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           CUSTOMIZATION LAYER                   │  │  │
│  │  │   (Nerd knobs, domain profiles, MCP surface)    │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │            BINARY STAR CORE               │  │  │  │
│  │  │  │                                           │  │  │  │
│  │  │  │     ┌─────────┐       ┌─────────┐        │  │  │  │
│  │  │  │     │ Podium  │◄─────►│Conductor│        │  │  │  │
│  │  │  │     │(scaffold)│      │(feedback)│        │  │  │  │
│  │  │  │     └────┬────┘       └────┬────┘        │  │  │  │
│  │  │  │          │                 │             │  │  │  │
│  │  │  │          └────────┬────────┘             │  │  │  │
│  │  │  │                   │                      │  │  │  │
│  │  │  │          ┌────────▼────────┐             │  │  │  │
│  │  │  │          │   ZETTELKASTEN  │             │  │  │  │
│  │  │  │          │    (Nebula)     │             │  │  │  │
│  │  │  │          └─────────────────┘             │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 0: Zettelkasten (The Nebula)

**Responsibility:** Persistent knowledge graph

**Stores:**
- Learning nodes (content, type, confidence, embeddings)
- Edges (co-occurrence, semantic similarity, user-defined links)
- Context scopes (tags)
- Audit trail (who created, when, why)

**Exposes:**
- Node CRUD
- Graph queries (by scope, relevance, recency)
- Embedding search

### Layer 1: Binary Star (Podium + Conductor)

**Podium Responsibility:** Decide what context to inject

- Relevance scoring against current query
- Tiered compilation (DNA → Field Guide → Full)
- Budget-aware selection
- Domain-aware extraction profiles

**Conductor Responsibility:** Learn from outcomes

- Track injection → response → feedback loop
- Adjust confidence scores
- Propose promotions/demotions
- LLM-as-judge for implicit signals

**Shared Interface:** Both read/write to Nebula

### Layer 2: Customization

**Responsibility:** Configuration surface

- Decay curves per learning type
- Confidence thresholds
- Injection budget limits
- Domain profiles (writing vs coding vs research)
- MCP server endpoints

**Exposes:** Config API, MCP tools

### Layer 3: Agents

**Responsibility:** Task-specific tuning

- Persona definitions (semantic focus, temperature, guardrails)
- Routing rules (which agent for which task)
- Tool access controls

**Exposes:** Agent registry, invocation API

### Layer 4: Shell

**Responsibility:** Human-facing interfaces

- Chat UI
- Settings pages
- CLI (H4X0R)
- Voice capture (Midnight Musings)
- External client connections via MCP

**Constraint:** Stateless. All state lives in layers below.

---

## Data Model (Scopes, Not Projects)

### Core Tables

```sql
-- The Nebula: Learning nodes
learnings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id UUID,                    -- Federation-ready
  content TEXT NOT NULL,
  type TEXT NOT NULL,              -- pattern, decision, invariant, anchor, character, etc.
  confidence FLOAT DEFAULT 0.5,
  embedding VECTOR(1536),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  source_conversation_id UUID,
  extraction_method TEXT           -- manual, auto, import
)

-- Context scopes (tags)
learning_scopes (
  learning_id UUID REFERENCES learnings,
  scope TEXT NOT NULL,             -- #python, #trading, #chorum, etc.
  PRIMARY KEY (learning_id, scope)
)

-- Graph edges
learning_links (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES learnings,
  target_id UUID REFERENCES learnings,
  link_type TEXT NOT NULL,         -- related, supports, contradicts, supersedes
  strength FLOAT DEFAULT 0.5,
  created_at TIMESTAMP
)

-- UI-level projects (saved filters)
projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id UUID,
  name TEXT NOT NULL,
  scope_filter JSONB,              -- { "include": ["#python", "#trading"], "exclude": ["#personal"] }
  domain TEXT,                     -- writing, coding, research, etc.
  settings JSONB,                  -- domain-specific config
  created_at TIMESTAMP
)

-- Feedback signals
feedback (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  learning_id UUID REFERENCES learnings,
  conversation_id UUID,
  signal TEXT NOT NULL,            -- positive, negative, proposed
  source TEXT NOT NULL,            -- explicit, implicit, conductor
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
)

-- Co-occurrence tracking
cooccurrence (
  learning_a UUID REFERENCES learnings,
  learning_b UUID REFERENCES learnings,
  count INTEGER DEFAULT 1,
  last_seen TIMESTAMP,
  PRIMARY KEY (learning_a, learning_b)
)
```

### Domain Profiles

```sql
domain_profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,              -- writing, coding, research, trading
  extraction_types JSONB,          -- ["character", "setting", "plot_thread"] for writing
  injection_priorities JSONB,      -- type weights
  decay_curves JSONB,              -- per-type decay config
  created_at TIMESTAMP
)
```

---

## Practical Constraints (Lessons from 1.0)

### Local Models + Web App

**Problem:** Chorum is a web app. How does it call local models?

**Current Reality:**
- Ollama/LM Studio expose local HTTP APIs (localhost:11434, etc.)
- Browser can't directly call localhost (CORS, security)
- Requires either: (a) user runs a local proxy, or (b) Electron wrapper

**2.0 Approach:**
- **Web version:** Cloud embeddings (OpenAI, Voyage) for embedding, user's API keys
- **Desktop version (Electron):** Can call localhost directly for local embeddings
- **MCP daemon (`chorumd`):** If user runs daemon locally, it handles local model calls

**Implication:** Local-first is achievable but requires desktop distribution, not just web.

### Cold Start

**Problem:** New users have empty graphs. First experience is underwhelming.

**Solutions:**
1. **Bootstrap from imports:** Conversation history from other LLMs (already built, needs chunking fix)
2. **Starter templates:** Pre-populated learnings for common domains (opt-in)
3. **Aggressive early extraction:** Lower confidence threshold for first N conversations
4. **Visible learning:** Show "I just learned X" notifications so users see the system working

### Rate Limits (Learned the Hard Way)

**Problem:** Batch extraction floods provider APIs.

**Solutions:**
1. **Chunked processing:** Max 3-5 turns per extraction call (already implemented)
2. **Queue with backoff:** Exponential delay on 429 errors
3. **Local embedding fallback:** If API rate-limited, queue for later or use local
4. **Budget awareness:** Track daily API spend, pause extraction if limit approached

### Zombie Queues

**Problem:** Serverless functions timeout, leaving items stuck in "processing."

**Solution:** Recovery clause resets items stuck >10 minutes (already implemented in 1.0 Phase 0).

---

## Migration Path: 1.0 → 2.0

### What Stays
- API routes (refactor, don't rewrite)
- MCP integration (elevate to core)
- Provider routing logic
- Encryption layer
- Auth (Supabase)

### What Changes
- Schema: Add scopes, refactor projects as filters
- Podium: Renamed from "relevance engine," same core logic
- Conductor: Renamed from "learning system," add LLM-as-judge
- UI: Finish hygge migration, scope-based filtering

### What's New
- Background evaluation loop (Conductor's LLM-as-judge)
- Desktop distribution option (Electron for local-first)
- Feedback inbox (proposed changes for user review)
- Cross-scope relevance (learnings visible across boundaries)

---

## Build Order

### Phase 0: Schema Migration
1. Add `learning_scopes` table
2. Migrate existing project-scoped learnings to scope tags
3. Refactor `projects` to store `scope_filter` instead of owning learnings
4. Backfill links from cooccurrence data

### Phase 1: Binary Star Naming + Interface
1. Rename internal references: relevance → Podium, learning system → Conductor
2. Define explicit interfaces between them
3. Add audit logging for injection decisions

### Phase 2: Conductor Enhancement
1. Implement feedback inbox (proposed changes)
2. Add LLM-as-judge background evaluation
3. Implement "inaction = approval" timeout

### Phase 3: MCP Elevation
1. Expand MCP tools (read_nebula, inject_learning, submit_feedback)
2. Document as primary interface
3. Test with Claude Desktop, Cursor, Windsurf

### Phase 4: Desktop Distribution (Optional)
1. Electron wrapper for local-first
2. Local embedding support (all-MiniLM-L6-v2)
3. Offline capability with sync

### Phase 5: Shell Polish
1. Complete hygge UI migration
2. Scope-based filtering in UI
3. Feedback inbox UI
4. Injection audit viewer

---

## Open Questions (Deferred)

1. **CRDT for multi-device sync:** Complex. Defer to 3.0 unless team/enterprise demand.
2. **Graph DB vs Postgres:** Postgres + pgvector is working. Revisit if graph queries become bottleneck.
3. **Markdown/file-based Nebula:** Ideal for sovereignty but complex for real-time. Consider as export format.

---

## Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Cold start to useful** | < 3 conversations | Users should see value fast |
| **Injection relevance** | > 80% positive feedback | Signal-to-noise ratio |
| **Cross-scope discovery** | > 1 per week per active user | Graph is connecting knowledge |
| **MCP adoption** | > 20% of active users | Daemon model is working |
| **Extraction accuracy** | < 10% user corrections | Conductor is learning well |

---

## Appendix: The Cosmology Metaphor

```
THE NEBULA (Zettelkasten)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Context Scopes (Tags) drift through the nebula like gas clouds
    
         #python ☁️          #writing ☁️          #trading ☁️
              ╲                  │                  ╱
               ╲                 │                 ╱
                ╲                │                ╱
                 ▼               ▼               ▼
              ┌─────────────────────────────────────┐
              │         BINARY STAR CORE            │
              │                                     │
              │    ★ Podium    ←→    ★ Conductor   │
              │   (scaffold)        (feedback)      │
              │                                     │
              └─────────────────────────────────────┘
                                │
                                │ gravitational pull
                                ▼
              ┌─────────────────────────────────────┐
              │            PROJECTS                 │
              │         (Planets in orbit)          │
              │                                     │
              │   🌍 Chorum Dev    🌎 Fiction       │
              │   🌏 Trading       🌕 Research      │
              │                                     │
              └─────────────────────────────────────┘
                                │
                                │
                                ▼
              ════════════════════════════════════════
                     Capture Surfaces (Ships)
                Chat │ Voice │ CLI │ IDE │ API
              ════════════════════════════════════════

Learnings exist in the Nebula, tagged with scopes.
Projects are orbital views — filters that determine what's visible.
The Binary Star pulls relevant learnings into injection range.
Ships (interfaces) pass through, depositing and retrieving cargo.
```

---

*Document consolidates learnings from Chorum 1.0 development, Gemini 3.1 critique, and architecture planning sessions.*
