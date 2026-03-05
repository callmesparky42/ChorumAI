# Phase 0 Check Results

- Generated (UTC): 2026-02-22T18:40:05.0781922Z
- Overall: **FAIL**
- PASS: 11 | FAIL: 1 | BLOCKED: 2

| Check | Status | Summary | Evidence |
|---|---|---|---|
| `phase0.directory_exists` | **PASS** | chorum_v2 directory presence | Path checked: c:\Users\dmill\Documents\GitHub\ChorumAI\chorum_v2 |
| `phase0.next_build` | **PASS** | npx next build execution | See checks/build.log (exit=0) |
| `phase0.typescript_quality` | **PASS** | TypeScript strict + no @ts-ignore/any in source/config scope | strict=True; noTsIgnore=True; noAnyInScope=True |
| `phase0.auth_wired` | **BLOCKED** | Auth wiring contract check | staticWired=True; .env.local exists=False |
| `phase0.drizzle_connectivity` | **BLOCKED** | Database connectivity requires real Supabase credentials | .env.local / DATABASE_URL not validated in this run |
| `phase0.spec_documents` | **FAIL** | Spec docs + required sections | LAYER_CONTRACTS.md missing section: ## Interface(s); NEBULA_SCHEMA_SPEC.md missing section: ## Interface(s); DOMAIN_SEEDS_SPEC.md missing section: ## Error Handling; DOMAIN_SEEDS_SPEC.md missing section: ## Interface(s) |
| `phase0.layer_directories` | **PASS** | Required layer directories exist | all present |
| `phase0.stub_files` | **PASS** | Stub files in place and non-implementation | missing=; nonLogic=True |
| `phase0.guardian_layer` | **PASS** | chorum-layer-guardian style audit | no violations detected |
| `phase0.guardian_nebula_schema` | **PASS** | nebula-schema-guardian baseline on empty schema.ts | schema.ts baseline valid |
| `phase0.changelog` | **PASS** | CHANGELOG contains Phase 0 entry | Checked for [2.0.0-alpha.0] — Phase 0 heading |
| `phase0.env_example` | **PASS** | .env.local.example present | Exists check |
| `phase0.skills_present` | **PASS** | All 5 guardian skills present | all present |
| `phase0.human_checkpoint_smoke` | **PASS** | Automated local render smoke (surrogate for manual checkpoint) | status=200 |

## Artifacts
- `checks/build.log`
- `checks/smoke_test.log`
- `checks/phase0_checks.json`
- `checks/phase0_checks.md`
