# Logic Flaws Found (Phase 1)

## 1. Critical Crash: Local Fallback Cost Calculation
**Severity**: CRITICAL
**Location**: `src/app/api/chat/route.ts` lines 440-443

**Description**:
When the system falls back to an auto-detected Local Provider (Ollama/LM Studio), the `actualProvider` will be set to the local model name (e.g., "llama3").
However, the `providerConfigs` array is sourced only from Database Credentials or Env Vars. It does not include auto-detected local providers.
Line 440 tries to find the config: `providerConfigs.find(p => p.provider === actualProvider)`.
This returns `undefined`.
Line 443 attempts to access `usedProviderConfig.costPer1M.input`, causing a `TypeError: Cannot read properties of undefined`.

**Consequence**: The chat request completes successfully (LLM generates text), but the API crashes 500 before returning the response to the user.

## 2. Logic Flaw: Budget Exhaustion Blocks Free Fallback
**Severity**: HIGH
**Location**: `src/lib/chorum/router.ts` line 86

**Description**:
The Router throws an error `All providers have exhausted daily budgets` if all cloud providers are over budget.
This happens *before* the fallback logic in `chat/route.ts` can kick in.
This means even if a user has a free Local LLM running (which has no budget), they cannot use it because the Router aborts the entire process due to Cloud budget exhaustion.

**Consequence**: Users are locked out of using their local models when their cloud budget is hit.

## 3. Inefficiency: Learning Injection DB Calls
**Severity**: LOW
**Location**: `src/lib/learning/injector.ts` lines 65-86

**Description**:
Even when `budget.maxTokens` is 0 (Trivial Query), the code proceeds to trigger `getProjectLearning(projectId)`, which fetches all learning items from the database.
While `relevance.scoreCandidates` is skipped, the database load still occurs.

**Consequence**: Unnecessary database latency on trivial queries (like "hi").

## 4. Logic Flaw: Inaccurate Cost Estimation
**Severity**: MEDIUM
**Location**: `src/lib/chorum/router.ts` line 165

**Description**:
Cost estimation assumes `Output Tokens = Input Tokens * 0.5` (Total = Input * 1.5).
In reality, conversational output length is highly variable and often uncorrelated to input length.
Additionally, `calculateCost` splits the estimated total 50/50. Since Output tokens are usually 3x more expensive than Input tokens, this skew can lead to incorrect "Cheapest Provider" selection.

**Consequence**: The "Cost Optimized" routing strategy operates on flawed data.
