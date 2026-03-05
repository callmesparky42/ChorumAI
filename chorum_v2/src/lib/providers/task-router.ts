// src/lib/providers/task-router.ts
// Task-aware provider resolver. Sits between business logic (judge, embedding,
// extraction) and the provider wallet (provider_configs table).
//
// Resolution order:
//   1. userCustomization.taskProviders[task] → find matching ProviderConfig
//   2. First enabled ProviderConfig (priority order)
//   3. Environment variable fallback (OPENAI_API_KEY, GOOGLE_AI_KEY, ANTHROPIC_API_KEY)

import { getUserProviders } from '@/lib/agents'
import { getUserCustomization } from '@/lib/customization/config'
import { getCheapModel } from './index'
import type { TaskName } from '@/lib/customization/types'

export interface ResolvedTaskProvider {
    provider: string
    apiKey: string
    model: string
    maxTokens: number
    dailyTokenLimit: number | undefined
    baseUrl?: string
    isLocal?: boolean
}

// ---------------------------------------------------------------------------
// In-memory per-task rate limiter
// Resets at UTC midnight. Acceptable for single-user / small-team deployments.
// ---------------------------------------------------------------------------

type UsageKey = `${string}:${TaskName}` // userId:task

interface UsageBucket {
    tokensUsed: number
    resetAt: number // UTC ms
}

const usageBuckets = new Map<UsageKey, UsageBucket>()

function getBucket(key: UsageKey): UsageBucket {
    const now = Date.now()
    const midnight = new Date()
    midnight.setUTCHours(24, 0, 0, 0)

    const existing = usageBuckets.get(key)
    if (existing && existing.resetAt > now) return existing

    const fresh: UsageBucket = { tokensUsed: 0, resetAt: midnight.getTime() }
    usageBuckets.set(key, fresh)
    return fresh
}

export class TaskRateLimitError extends Error {
    constructor(task: TaskName, used: number, limit: number) {
        super(`Daily token limit reached for task "${task}": ${used}/${limit} tokens used. Resets at UTC midnight.`)
        this.name = 'TaskRateLimitError'
    }
}

/**
 * Check if the task is within its daily token budget and record usage.
 * Call AFTER a successful provider call with the actual tokens used.
 */
export function recordTaskUsage(userId: string, task: TaskName, tokensUsed: number, limit: number | undefined): void {
    if (!limit) return
    const key: UsageKey = `${userId}:${task}`
    const bucket = getBucket(key)
    bucket.tokensUsed += tokensUsed
}

/**
 * Throws TaskRateLimitError if the user has exceeded their daily limit for this task.
 * Call BEFORE making the provider call.
 */
export function assertTaskBudget(userId: string, task: TaskName, limit: number | undefined): void {
    if (!limit) return
    const key: UsageKey = `${userId}:${task}`
    const bucket = getBucket(key)
    if (bucket.tokensUsed >= limit) {
        throw new TaskRateLimitError(task, bucket.tokensUsed, limit)
    }
}

/**
 * Returns current usage stats for a task (for the settings UI to display).
 */
export function getTaskUsage(userId: string, task: TaskName): { tokensUsed: number; resetAt: Date } {
    const key: UsageKey = `${userId}:${task}`
    const bucket = getBucket(key)
    return { tokensUsed: bucket.tokensUsed, resetAt: new Date(bucket.resetAt) }
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

const ENV_FALLBACKS: Array<{ provider: string; envKey: string }> = [
    { provider: 'openai', envKey: 'OPENAI_API_KEY' },
    { provider: 'google', envKey: 'GOOGLE_AI_KEY' },
    { provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
]

const DEFAULT_MAX_TOKENS: Record<TaskName, number> = {
    judge: 1024,
    embedding: 512,
    extraction: 2048,
    chat: 4096,
}

/**
 * Resolve the provider to use for a specific task.
 * Returns null if no provider is available.
 */
export async function resolveTaskProvider(
    userId: string | undefined,
    task: TaskName,
): Promise<ResolvedTaskProvider | null> {
    if (userId) {
        // Step 1: Check task-specific assignment in user customization
        const [cust, userProviders] = await Promise.all([
            getUserCustomization(userId),
            getUserProviders(userId),
        ])

        const taskConfig = cust.taskProviders?.[task]
        if (taskConfig?.provider) {
            const match = userProviders.find(
                (p) => p.provider === taskConfig.provider && p.isEnabled,
            )
            if (match) {
                return {
                    provider: match.provider,
                    apiKey: match.apiKey,
                    model: taskConfig.model ?? match.modelOverride ?? getCheapModel(match.provider) ?? 'auto',
                    maxTokens: taskConfig.maxTokens ?? DEFAULT_MAX_TOKENS[task],
                    dailyTokenLimit: taskConfig.dailyTokenLimit,
                    ...(match.baseUrl ? { baseUrl: match.baseUrl } : {}),
                    ...(match.isLocal ? { isLocal: match.isLocal } : {}),
                }
            }
        }

        // Step 2: First enabled provider (priority sorted by DB priority field)
        const active = userProviders
            .filter((p) => p.isEnabled)
            .sort((a, b) => a.priority - b.priority)[0]

        if (active) {
            return {
                provider: active.provider,
                apiKey: active.apiKey,
                model: active.modelOverride ?? getCheapModel(active.provider) ?? 'auto',
                maxTokens: DEFAULT_MAX_TOKENS[task],
                dailyTokenLimit: undefined,
                ...(active.baseUrl ? { baseUrl: active.baseUrl } : {}),
                ...(active.isLocal ? { isLocal: active.isLocal } : {}),
            }
        }
    }

    // Step 3: Environment variable fallback
    for (const { provider, envKey } of ENV_FALLBACKS) {
        const key = process.env[envKey]
        if (key) {
            return {
                provider,
                apiKey: key,
                model: getCheapModel(provider) ?? 'auto',
                maxTokens: DEFAULT_MAX_TOKENS[task],
                dailyTokenLimit: undefined,
            }
        }
    }

    return null
}
