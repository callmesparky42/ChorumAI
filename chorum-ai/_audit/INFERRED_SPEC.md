# Inferred Specification: Chorum AI

## 1. System Overview
Chorum is a multi-provider LLM orchestration platform built on Next.js 16. It acts as an intelligent proxy that routes user prompts to the most suitable LLM provider (Authropic, OpenAI, Google, Local) based on task type, cost, and user budget. It features an "Agent" system that personalizes the system prompt and behavior.

## 2. Core Architecture
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (Supabase) + Drizzle ORM
- **Auth**: Supabase Auth (with a custom "NextAuth shim" interface)
- **State**: Zustand (Client), Postgres (Server)

## 3. Key Workflows

### 3.1 Chat Pipeline (`/api/chat`)
1.  **Authentication**: Validates session via `auth()` (Supabase SSR).
2.  **User Initialization**: Ensures user record and settings exist.
3.  **Preprocessing**:
    -   **PII Redaction**: (Optional) Scans and anonymizes PII.
    -   **Project Context**: Loads custom instructions and tech stack.
    -   **User Context**: Injects user bio.
4.  **Agent Orchestration**:
    -   analyzes prompt to select a persona (Analyst, Coder, etc.).
    -   Overrides system prompt with agent persona.
5.  **Memory Retrieval**:
    -   Fetches relevant past messages (RAG-lite).
    -   Injects "Learned Patterns" (invariants).
6.  **Routing (The "Brain")**:
    -   `ChorumRouter` selects provider based on:
        -   **Task Type** (Code, Reasoning, Vision, General).
        -   **Capabilities** (filtering providers).
        -   **Budget** (daily limits).
        -   **Strategy** (Cost vs. Quality).
7.  **Execution with Fallback**:
    -   Attempts primary provider.
    -   If failure, retries with `callProviderWithFallback` chain.
8.  **Post-Processing**:
    -   **Validation**: Checks response against "Learned Invariants".
    -   **Learning**: Asynchronously extracts patterns from the interaction.
    -   **Logging**: Records usage and cost.
    -   **Summarization**: Asynchronously summarizes long conversations.

### 3.2 Routing Logic (`src/lib/chorum/router.ts`)
-   **Task Inference**: Regex-based keyword matching to guess `TaskType`.
    -   *Potential Issue*: Regex might be too simple.
-   **Cost Estimation**: `input * 1.5` estimation.
    -   *Logic Check*: Splits tokens 50/50 for Input/Output cost calc. This is often inaccurate as Output tokens are usually much more expensive.
-   **Budget Enforcement**: Throws error if all valid providers are over budget.

## 4. Data Models (Inferred)
-   `users`: Settings, Budgets, Bio.
-   `projects`: Context containers.
-   `conversations`: Chat sessions.
-   `messages`: Individual chat turns (includes cost/provider metadata).
-   `providerCredentials`: User-stored API keys (encrypted).
-   `usageLog`: Tracking spend.

## 5. Security & Privacy
-   **PII**: Regex-based redaction.
-   **Keys**: Encrypted in DB? (Code calls `decrypt`).
-   **Middleware**: Protects `/app` and `/api` (excluding auth callbacks).

## 6. Observations & Potential Flaws
1.  **Strict Budgeting**: Router throws hard error if budget exceeded. No "soft limit" or user override visible in the strict logic path.
2.  **Cost Calculation**: The 50/50 split for Input/Output tokens in `calculateCost` is imprecise given different pricing models (Input is usually cheaper).
3.  **Regex Task Inference**: Very basic (`/debug|fix/`). Might misclassify "Help me debug my relationship" as code generation.
4.  **Token Estimation**: `inputTokens * 1.5` is a rough heuristic.
