The Shift
Chorum 1.0 was a router that learned.
Chorum 2.0 is a cognitive backend that routes.
The difference isn't semantic — it's structural. The knowledge graph moves from "feature" to "foundation." Everything else orbits around it.

Core Thesis

Every interaction with an LLM is an opportunity to learn. Every future interaction should benefit from that learning. The system that mediates this loop is the product — not the chat interface, not the agents, not the routing. The loop.


Design Principles
1. The Graph is the Product
The Zettelkasten isn't a feature — it's the persistent substrate. Apps come and go. Interfaces evolve. Models get replaced. The graph endures.
Implication: Every architectural decision should ask "how does this strengthen or weaken the graph?"
2. Binary Star Core
The Conductor (what to inject) and the Feedback Loop (what worked) are co-dependent. Neither makes sense alone.

Conductor without Feedback = static injection, no learning
Feedback without Conductor = learning with no application

They orbit each other, both pulling from and pushing to the graph.
Implication: These two systems share interfaces, not just data. Changes to one must consider the other.
3. Capture Surfaces are Disposable
Chat, voice, API, CLI — these are entry points, not the product. They should be:

Cheap to build
Easy to replace
Stateless (all state lives in the core)

Implication: No business logic in the UI layer. Ever.
4. Layers Have Contracts
Each layer exposes a defined interface to the layer above it. Inner layers know nothing about outer layers.
Zettelkasten → knows nothing about Conductor
Conductor → knows nothing about Agents
Agents → knows nothing about UI
Implication: You can swap any outer layer without touching inner layers.
5. Token Economy is a First-Class Concern
Every injection has a cost. The system must:

Track token spend per interaction
Justify injection value against cost
Allow budget constraints at every layer

Implication: "Is this worth injecting?" is a question the system answers, not the user.
6. Learning is Near-Real-Time with Bounded Async Jobs
Extraction happens per-turn, not per-session. Feedback signals are processed within a bounded async window, not per-day. The loop is tight.
Implication: No "sync" buttons. No manual batch triggers. Background jobs (decay ticks, zombie recovery, compaction) are invisible infrastructure — they run on bounded schedules and do not represent user-initiated processing. The user never waits for the system to "catch up."
7. Domain Awareness is Structural
A writing project and a coding project aren't the same schema with different labels. They have different:

Extraction targets
Relevance weights
Injection priorities

Implication: Domain isn't a tag — it's a configuration profile that changes system behavior.
8. Sovereignty by Default
User data is:

Encrypted at rest
Never leaves their control (unless they choose sync)
Portable (export everything, import anywhere)

Implication: No features that require Anthropic/OpenAI/Google to see user context. Ever.
9. Self-Improvement Has Guardrails
The Feedback Loop can adjust weights, thresholds, and priorities. It cannot:

Delete learnings without consent
Promote unverified extractions
Override user-pinned items

Implication: Automation proposes, human disposes.
10. The System Explains Itself
Every injection should be auditable:

Why was this included?
What was the score?
What was excluded and why?

Implication: Observability isn't a feature — it's a requirement. No black boxes.

The Layers (Summary)
LayerResponsibilityExposes0: ZettelkastenPersistent knowledge graphNodes, links, queries1: Binary StarConductor (injection) + Feedback (learning)Relevance API, outcome API2: CustomizationNerd knobs, domain profilesConfig API, MCP surface3: AgentsPersona, focus, guardrailsAgent definitions, task routing4: ShellUI, CLI, capture surfacesUser-facing interfaces

What This Enables
Use CaseHow It WorksChorum ChatShell (chat UI) → Agents → Customization → Binary Star → ZettelkastenMidnight MusingsShell (voice capture) → Customization → Binary Star → ZettelkastenIT AtlasShell (doc UI) → Customization (infra domain) → Binary Star → ZettelkastenOptions TradingShell (trade journal) → Customization (finance domain) → Binary Star → ZettelkastenSecOps ResearchShell (paper ingestion) → Customization (academic domain) → Binary Star → ZettelkastenMCP IntegrationExternal tool → Customization (API) → Binary Star → Zettelkasten
Same core. Different surfaces. Shared learning.

Open Questions (To Resolve Before Implementation)

Graph storage: Postgres with recursive CTEs? Dedicated graph DB? Hybrid?
Feedback signals: What counts as "positive outcome"? User explicit (👍), implicit (continued conversation), or inferred (task completion)?
Cross-project learning: Should the graph be project-scoped or user-scoped with project views?
Multi-user: Does 2.0 support shared graphs (teams) or is that 3.0?
Offline-first: How does the binary star work when disconnected? Queue and sync, or degrade gracefully?

Design Principles (Revised)
1. The Graph is the Product
The Zettelkasten is the nebula — the persistent substrate in which all knowledge exists. Projects are planets within it. Apps are ships passing through. The nebula endures.
2. Binary Star Core (Podium + Conductor)
Podium: What to inject, when, and how much. The scaffold that shapes what the model sees.
Conductor: What worked, what didn't, and what to adjust. The feedback that makes the scaffold smarter.
They orbit each other. Inseparable.
3. Plan for Federation
Token budgets scale with deployment:
TierContext BudgetUse CaseLocalMinimalOffline, privacy-maxPersonalModerateIndividual user, API costs matterTeamHigherShared context, amortized costEnterpriseLargeGovernance, audit trails, money is less object
The architecture must support all tiers with the same core — only the budget dials change.
Implication: Tiered context injection isn't a feature, it's foundational. Every query path must respect budget constraints.
4. Capture Surfaces are Disposable
Chat, voice, API, CLI — entry points, not product. Stateless. Cheap to build. Easy to replace.
5. Layers Have Contracts
Inner layers know nothing about outer layers. Interfaces are explicit.
6. Token Economy is First-Class
Every injection has a cost. The system justifies value against budget. "Is this worth injecting?" is answered by the system, not the user.
7. Sovereignty by Default
User data encrypted, user-controlled, portable. No features require providers to see user context.
8. Self-Improvement Has Guardrails
Conductor proposes adjustments. Humans approve deletions, promotions, overrides.
9. The System Explains Itself
Every injection is auditable. Why included, what scored, what excluded. No black boxes.

Resolved Questions
1. Graph Storage
Decision: Start with what's free/low-cost and proven. Postgres with JSONB for flexibility, or explore what the crowd (LLMs + community) recommends for knowledge graphs at our scale.
Consideration: Cassandra came up early. Could self-host eventually. For now, stay on Supabase/Postgres or equivalent until scale demands change.
Action: Crowdsource recommendations before committing. Build abstraction layer so storage can migrate.
2. Positive Feedback Signals
Decision: Thumbs only. Explicit human signal.
Rationale: Implicit signals (continued conversation, task completion) are noisy. Models like engagement but also need reminders to stay on track. Clean signal > inferred signal.
Implication: The Conductor learns from 👍/👎, nothing else. Keep it simple.
3. Cross-Project Learning
Decision: Context begins with the conversation. Projects are planets.
Structure:
Zettelkasten (nebula)
├── Project A (planet)
│   ├── Learnings scoped here
│   └── Can pull from nebula if relevant
├── Project B (planet)
│   └── Isolated unless explicitly linked
└── User-level patterns (stars? dark matter?)
    └── Cross-cutting knowledge that transcends projects
Open question: How does knowledge "graduate" from project to nebula? User action? Confidence threshold? Usage across projects?
4. Multi-User / Federation
Decision: Design for it now, implement later.
Tiers:

Solo: One user, their graph, their projects
Team: Shared graph, role-based access, audit trail
Enterprise: Governance layer, compliance, chain-of-decision tracking

Implication: Schema must support user_id AND team_id from day one, even if team features don't ship in 2.0.
5. Offline / Sovereignty
Decision: This is hard. Queue-and-sync kills rate limits (we learned this).
Options to explore:

Degrade gracefully: Offline = no learning, just cached injection
Local-first with sync: SQLite local, sync to cloud when connected
Hybrid: Critical path works offline, learning queues but rate-limited on reconnect

Implication: Needs more thought. Don't block 2.0 on this, but don't design in a way that makes it impossible.

The Cosmology (Working Metaphor)
┌─────────────────────────────────────────────────────────────┐
│                      ZETTELKASTEN                           │
│                      (The Nebula)                           │
│                                                             │
│    ┌─────────┐              ┌─────────┐                     │
│    │Project A│              │Project B│                     │
│    │(Planet) │              │(Planet) │                     │
│    └────┬────┘              └────┬────┘                     │
│         │                        │                          │
│         └──────────┬─────────────┘                          │
│                    │                                        │
│              ┌─────▼─────┐                                  │
│              │  Binary   │                                  │
│              │   Star    │                                  │
│              │           │                                  │
│              │ ┌───────┐ │                                  │
│              │ │Podium │◄├──► Scaffold (injection)          │
│              │ └───┬───┘ │                                  │
│              │     │     │                                  │
│              │ ┌───▼───┐ │                                  │
│              │ │Conduct│◄├──► Feedback (learning)           │
│              │ └───────┘ │                                  │
│              └───────────┘                                  │
│                                                             │
│         ════════════════════════════════                    │
│              Capture Surfaces (Ships)                       │
│         Chat │ Voice │ API │ CLI │ etc.                     │
└─────────────────────────────────────────────────────────────┘

Next Steps

✅ Principles locked (pending your review)
⏳ Crowdsource graph storage recommendations
⏳ Define "graduation" from project to nebula
⏳ Spec the Podium interface
⏳ Spec the Conductor interface
⏳ Schema design with federation in mind

Graduation: Resolved
You just answered it:
Knowledge lives in the nebula by default. Projects don't "own" learnings — they view them through a lens.
Nebula (all learnings)
    ↓ filtered by
Project lens (domain, relevance, recency)
    ↓ shaped by
Podium (budget, confidence, priority)
    ↓ delivered to
Model
Graduation isn't promotion — it's visibility.

A learning extracted in Project A exists in the nebula
Project B can see it if relevance scores high enough
User pins something as "golden rule" → confidence floor = 1.0, visible everywhere
Domain tags determine which projects naturally see what

The gate isn't "move from project to nebula." The gate is "should this be visible beyond its origin?"
That's a confidence threshold + optional human override. Clean.

---

## Addendum: Resolved Decisions & Build Strategy

### Graph Storage: Decision Locked
**Decision**: Postgres + pgvector + JSONB.

**Rationale**:
- Already running on Supabase/Postgres — no new operational surface
- `pgvector` gives semantic similarity queries natively, which is exactly the mechanism for "does Project B see this learning from Project A?"
- Recursive CTEs handle graph traversal for parent/child relationships without a dedicated graph DB
- Dedicated graph DBs (Neo4j, etc.) add operational complexity with no payoff at current scale
- Abstraction layer still required — storage should be swappable, but the default is Postgres until scale demands otherwise

**Implication**: The Zettelkasten is a Postgres schema with vector embeddings. The nebula metaphor maps onto rows with `user_id`, `team_id`, `domain_tags`, `confidence_floor`, and a vector column. Querying the nebula is a pgvector similarity search filtered by domain and scoped by lens.

---

### Feedback Signals: Canonical Policy

**Decision**: Explicit thumbs signals (👍/👎) are the **only** source of automatic `confidence_base` changes in v2.0. All other signal types are stored but not acted on automatically.

**Signal tiers:**
| Signal | Stored | Auto-applied in v2.0 | Notes |
|--------|--------|----------------------|-------|
| `explicit` (thumbs up/down) | Yes | **Yes** — immediate delta to `confidence_base` | Hard signal; trusted |
| `heuristic` (turn-pattern analysis) | Yes | **No** — soft prior only | Deferred to v2.1 after offline calibration |
| `inaction` (no interaction after 7 days) | Yes | **No** — no confidence nudge | Deferred to v2.1 |
| `end_of_session_judge` | Yes | **No** — always queued for human approval | Opt-in only; sovereignty constraint |

**Rationale**: Implicit signals are noisy and their weights are unvalidated. Automatic confidence drift from unverified signals is the failure mode — not the feature. Clean explicit signal > uncalibrated implicit drift. Heuristic and inaction signals accumulate as a dataset for v2.1 offline experimentation before any auto-application is enabled.

**Implication**: The feedback schema tracks `signal` (positive/negative/none), `source` (explicit/heuristic/inaction/llm_judge), `timestamp`, `injection_id`. Conductor processing checks `source = 'explicit'` before applying any automatic adjustment.

---

### Schema: Federation from Day One
**Decision**: `user_id` AND `team_id` are present in the schema from initial migration, even if team features ship in 3.0.

**Rationale**: Retrofitting multi-tenancy onto a schema that was designed for a single user is one of the most expensive refactors possible. Adding nullable `team_id` columns from the start costs nothing and keeps the 3.0 door open without a schema overhaul.

**Implication**: Every core table (learnings, projects, feedback, conductor settings) carries both identifiers. Access control logic in 2.0 ignores `team_id` but the column exists and is indexed.

---

### Migration Strategy: v1 → v2
The v2.0 rewrite is a clean break. The following carry forward from v1:

| What | Status | Notes |
|---|---|---|
| `portability/` export/import logic | Carry forward | Adapt to nebula model (learnings arrive without project ownership) |
| Drizzle migration history | Reference only | v2 starts a fresh migration chain |
| `db/` schema patterns | Inform, not copy | v2 schema is redesigned with federation + vector in mind |
| Vercel/Supabase deployment config | Carry forward | Infrastructure stays the same |
| UI shell components | Selectively carry | Pure-UI components with no business logic are reusable |
| Business logic in `src/app/` API routes | Do not carry | This is the primary debt. Rewrite to match layer contracts. |

**v1 Compat**: No v1 compat mode. Users export from v1 via the portability tool, import to v2. The export format becomes the handoff contract.

**Implication**: The portability spec (export format) is a deliverable *before* v2 build begins. It is the bridge.

---

### Build Philosophy: Spec First
The failure mode of v1 was iteration without a definitive plan — features bolted onto features, logic accumulating in layers that shouldn't hold it, debt compounding with each sprint.

v2.0 is built differently:

1. **Spec before code.** Every layer gets a written interface contract before a line of implementation is written. The contract is the deliverable; the code is the consequence.
2. **LLMs build from specs, not from intuition.** When a spec is clear, LLM-assisted development is fast and correct. When it isn't, the LLM interpolates — and interpolation is where the debt starts.
3. **No features without a home.** Every feature belongs to a specific layer. If it can't be assigned a layer, the feature isn't ready to be built yet.
4. **The principles are the linter.** Before merging any implementation, ask: does this violate any of the 10 design principles? If yes, it doesn't ship.

**Deliverables before build begins:**
- [ ] Zettelkasten schema spec (tables, columns, indexes, vector strategy)
- [ ] Podium interface spec (what it accepts, what it returns, token budget contract)
- [ ] Conductor interface spec (what signals it consumes, what it adjusts, what it cannot touch)
- [ ] v1 export format spec (the portability bridge)
- [ ] Layer contract document (TypeScript interfaces for each layer boundary)
- [ ] Technology selection doc (finalize: auth, hosting, LLM abstraction layer, embedding model)


What You Got
Skill                    Purpose                                Best Model
chorum-layer-guardian   Enforces architectural boundaries (no business logic in UI, no outer→inner imports)Sonnet 4.6
nebula-schema-guardian  Enforces data model integrity (federation-ready, scopes not ownership, required fields)Sonnet 4.6
conductor-spec-agent    Enforces feedback loop correctness (guardrails, zombie recovery, rate limiting)Opus 4.6
podium-injection-agent  Enforces context selection correctness (attention economy, domain awareness, audit trail)Gemini 3.1
mcp-contract-agent      Enforces daemon interface (4 core tools, auth, human-in-the-loop)Sonnet 4.6