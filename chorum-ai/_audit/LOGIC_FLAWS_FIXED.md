# Logic Flaws Fixed

## Critical Crash in Chat API (Local Fallback)
-   **Issue**: When falling back to a local provider (which might not be in the configured cloud providers list), `usedProviderConfig` was undefined, causing a crash when calculating cost.
-   **Fix**: Added a check for `usedProviderConfig`. If undefined (likely local fallback), it defaults to a cost of 0.
-   **File**: `src/app/api/chat/route.ts`

## Budget Exhaustion Blocking Fallback
-   **Issue**: The `ChorumRouter` threw a generic `Error` when all cloud providers exceeded their daily budget. The Chat API did not catch this specifically, causing the request to fail instead of falling back to free local models.
-   **Fix**:
    1.  Created `BudgetExhaustedError` class in `src/lib/chorum/router.ts`.
    2.  Updated `ChorumRouter` to throw this specific error.
    3.  Updated `src/app/api/chat/route.ts` to catch `BudgetExhaustedError`.
    4.  Implemented logic to detecting local providers (Ollama/LM Studio) and forcing a fallback if the cloud budget is exhausted.

## Auth Module Verification
-   **Action**: Created `src/lib/security.test.ts` to verify `validateHttpsUrl` and `validateProviderEndpoint`.
-   **Result**: Validated that the security utilities correctly handle HTTPS enforcement and localhost exceptions.

## Inefficient DB Calls (Learning Injector)
-   **Issue**: The learning injector performed 3 expensive database queries (Learning Items, File Metadata, Link Graph) plus a vector embedding for every request, even "trivial" ones (e.g. "hi") where the context budget was 0.
-   **Fix**: Wrapped the data fetching logic in a conditional check (`if (budget.maxTokens > 0)`). Trivial queries now skip these operations entirely, reducing latency and DB load.
-   **File**: `src/lib/learning/injector.ts`

## Plaintext API Token Storage
-   **Issue**: API tokens for MCP were stored and validated in plaintext in the database (`api_tokens` table).
-   **Fix**: Implemented SHA-256 hashing in `src/lib/mcp/auth.ts`. Tokens are now hashed before storage and validation. `generateToken` returns the raw token to the user but stores the hash.
-   **File**: `src/lib/mcp/auth.ts`
