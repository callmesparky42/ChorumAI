Chorum 2.0: Deployment Checklist & Inter-Phase Protocol
Pre-Phase 0: Environment Setup
□ Create chorum-v2/ repository (clean, no v1 history)
□ Initialize Next.js with TypeScript strict mode
□ Configure Drizzle ORM + Supabase connection
□ Set up Supabase project (new, separate from v1)
□ Copy tools/skills/ (5 guardian skills) into repo
□ Create docs/specs/ directory structure
□ Configure CI: TypeScript build must pass before any merge
□ Create CHANGELOG.md with v2.0.0-alpha.0 header

Inter-Phase Protocol (Execute Between EVERY Phase)
Gate 1: Spec Freeze Verification
□ Phase N+1 spec document exists in docs/specs/
□ Spec contains: Purpose, Non-Goals, Interfaces (TypeScript), Invariants, Error Handling, Testing Contract, "What v1 Got Wrong"
□ Spec reviewed by at least one LLM other than the one that wrote it
□ No TODOs or "TBD" in the spec — all decisions locked
Gate 2: Guardian Skill Audit
□ Run relevant guardian skill(s) against Phase N deliverables
□ All checklist items pass
□ If any FAIL: fix before proceeding, update spec if the failure revealed a gap
□ Document guardian run output in phase completion commit
Gate 3: Build Verification
□ npx next build passes with zero errors
□ TypeScript strict mode: no @ts-ignore, no 'any' without justification
□ All new files are in correct layer directory (per layer-guardian)
□ No imports violating layer direction (inner cannot import outer)
Gate 4: Schema Verification (Phases 1-2 only)
□ Migration file named correctly: NNNN_snake_case.sql
□ All tables have user_id NOT NULL
□ All tables have team_id (nullable)
□ No FK from learnings → projects
□ Embeddings computed at insert time (not deferred)
□ Run nebula-schema-guardian checklist
Gate 5: Interface Contract Verification
□ All public functions have TypeScript interfaces (not 'any')
□ Interface matches spec document exactly
□ If interface changed from spec: update spec FIRST, then code
□ No business logic in Layer 4 (Shell) — guardian enforces
Gate 6: Test Baseline
□ Core functions have at least one happy-path test
□ Invariants have negative tests (prove guardrails work)
□ Tests run in CI before merge
Gate 7: Documentation Sync
□ CHANGELOG.md updated with phase completion
□ Any spec changes during implementation are backported to spec doc
□ README.md reflects current state (not aspirational)
Gate 8: Human Checkpoint
□ YOU review the phase deliverables (not just LLM self-review)
□ Run the app locally — does it do what the spec says?
□ Check one "audit trail" feature manually (can you trace why X happened?)
□ Gut check: does this feel like debt or foundation?

Phase-Specific Checklists
Phase 0 → Phase 1 Transition
□ All 5 pre-implementation specs written and committed
□ Scaffold builds successfully (empty app, no logic)
□ Drizzle connected to Supabase (test query works)
□ Auth wired (can log in, session.user.id available)
□ Guardian skills copied and accessible
□ chorum-layer-guardian passes on empty scaffold
□ nebula-schema-guardian passes on empty schema.ts
Phase 1 → Phase 2 Transition
□ Migration 0001_nebula_core.sql applied successfully
□ All 13 tables created with correct columns
□ pgvector extension enabled
□ Indexes created (user_id, team_id, scope, embeddings)
□ CRUD functions exist in src/lib/nebula/
□ Embedding insertion works (both 1536 and 384 tables)
□ Graph query returns results (semantic similarity search)
□ nebula-schema-guardian passes on populated schema
□ No business logic in nebula/ — pure data access
Phase 2 → Phase 3 Transition
□ Podium interface implemented per spec
□ Conductor interface implemented per spec
□ Tiered compilation works (Tier 1/2/3 selection correct)
□ Budget clamping applied in ALL code paths
□ Confidence formula matches spec exactly
□ Zombie recovery implemented and tested
□ Guardrails enforced (test: try to delete a learning — must fail)
□ Injection audit log populated on every injection
□ podium-injection-agent passes
□ conductor-spec-agent passes
□ Binary Star can run headless (no UI dependency)
Phase 3 → Phase 4 Transition
□ MCP endpoint /api/mcp responds
□ All 4 core tools implemented: read_nebula, get_context, inject_learning, submit_feedback
□ Auth: Bearer token required, JWT verified
□ Human-in-the-loop: writes queued, reads free
□ ChorumClient interface works (both Local and MCP transports)
□ Test with external client (Claude Desktop or Cursor)
□ mcp-contract-agent passes
□ Domain seeds populated (coding, writing, trading at minimum)
□ Decay config accessible via API
Phase 4 → Phase 5 Transition
□ Provider routing copied from v1 and working
□ Persona definitions loadable
□ Agent routing works (task → correct agent)
□ Tool access controls enforced
□ End-to-end test: MCP client → Agent → Binary Star → Nebula → Response
□ No Shell code yet — everything is headless/API
Phase 5 → Release Transition
□ Chat UI renders and sends messages
□ Settings pages work
□ Conductor inbox UI shows proposals
□ Scope browser displays tags
□ Injection audit viewer shows why things were injected
□ ALL UI is stateless — state lives in layers below
□ chorum-layer-guardian passes on all Shell components
□ Full end-to-end test: UI → Agent → Binary Star → Nebula → Response → UI
□ Portability: export from v1, import to v2 works
□ CHANGELOG complete for v2.0.0

LLM Drift Prevention Protocol
Before Every LLM Session
□ Load relevant spec document into context
□ Load relevant guardian skill into context
□ State explicitly: "We are implementing Phase N, file X"
□ If continuing from previous session: summarize what was done
During LLM Session
□ If LLM suggests something not in spec: STOP
   → Either update spec first, or reject the suggestion
□ If LLM asks a clarifying question: answer it, then add answer to spec
□ If LLM produces code with 'any' or @ts-ignore: challenge it
□ If LLM creates file in wrong directory: correct immediately
After Every LLM Session
□ Review all generated code before committing
□ Run guardian skill on new/modified files
□ Build must pass
□ If spec changed: commit spec change separately from code change
□ Update CHANGELOG with what was accomplished

Red Flags (Stop and Reassess)
Red FlagWhat It MeansAction"Let me just add this quick feature"Scope creepDoes it have a layer? Is it in a spec?Import from outer layer in inner layerLayer violationFix immediately, understand why it happenedBusiness logic in src/app/Shell pollutionMove to appropriate layer"We can refactor this later"Debt accumulationRefactor now or don't mergeTest skipped "because it's obvious"Regression riskWrite the testSpec says X, code does YDriftUpdate spec or fix code — they must matchGuardian skill failsContract violationFix before proceeding"The LLM suggested this optimization"Unspecified changeIs it in scope? Does it match principles?

Rollback Protocol
If a phase goes sideways:
1. Do NOT proceed to next phase
2. Identify: what broke? Spec gap? Implementation error? Wrong assumption?
3. If spec gap: update spec, re-run guardian, then re-implement
4. If implementation error: revert to last known good, re-implement from spec
5. If wrong assumption: escalate to architecture review (may need spec rewrite)
6. Document what went wrong in CHANGELOG or LESSONS_LEARNED.md

Success Criteria for "Phase Complete"
A phase is complete when:

✅ All deliverables from phase spec exist
✅ All relevant guardian skills pass
✅ Build passes with zero errors
✅ At least one human (you) has manually verified core functionality
✅ CHANGELOG updated
✅ No TODOs marked "will fix in next phase"
✅ You could explain what was built to someone else without referencing the code


Phase 0: Ready to Deploy?
□ chorum-v2/ repo created
□ Next.js + TypeScript + Drizzle initialized
□ Supabase project connected
□ 5 guardian skills in tools/skills/
□ docs/specs/ directory ready
□ CI configured (build must pass)
□ You've read this checklist and commit to following it

→ If all checked: BEGIN PHASE 0