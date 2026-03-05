import { getCheapModel, getContextWindow, getDefaultModel } from '@/lib/providers'
import type { DomainSignal } from '@/lib/core'
import { getPersona, getPersonas } from './personas'
import { getUserProviders } from './provider-configs'
import type { AgentDefinition, RoutingDecision, TaskComplexity } from './types'

const COMPLEXITY_TIERS: Record<TaskComplexity, 'fast' | 'standard' | 'flagship'> = {
  trivial: 'fast',
  simple: 'fast',
  moderate: 'standard',
  complex: 'flagship',
  critical: 'flagship',
}

export function estimateComplexity(query: string): TaskComplexity {
  const lower = query.toLowerCase()
  const length = query.length

  if (length < 20) return 'trivial'
  if (/\b(hello|hi|hey|thanks|bye|good morning)\b/.test(lower)) return 'trivial'
  if (/\b(explain|analyze|compare|design|architect|refactor|debug|optimize)\b/.test(lower)) {
    return 'complex'
  }
  if (/\b(review|implement|create|build|write)\b/.test(lower)) return 'moderate'
  if (length > 500) return 'complex'
  return 'simple'
}

export async function route(
  query: string,
  userId: string,
  agentId?: string,
  domainSignal?: DomainSignal,
  contextWindowSize?: number,
): Promise<RoutingDecision> {
  if (agentId) {
    const persona = await getPersona(agentId)
    if (persona) {
      const resolved = await resolveProviderForPersona(persona, userId)
      return {
        persona,
        provider: resolved.provider,
        model: resolved.model,
        contextWindowSize: contextWindowSize ?? getContextWindow(resolved.provider, resolved.model),
        reason: `explicit agent override: ${persona.name}`,
      }
    }
  }

  const allPersonas = await getPersonas(userId)
  const complexity = estimateComplexity(query)
  const detected = domainSignal?.detected ?? []

  let bestPersona = allPersonas.find((persona) => persona.name === 'default') ?? allPersonas[0]
  let bestScore = 0

  if (!bestPersona) {
    throw new Error('No personas available. Seed system personas first.')
  }

  for (const persona of allPersonas) {
    const includeScopes = persona.scopeFilter.include
    if (includeScopes.length === 0) continue

    const overlap = detected.filter((scope) => includeScopes.includes(scope)).length
    if (overlap > bestScore) {
      bestScore = overlap
      bestPersona = persona
    }
  }

  const resolved = await resolveProviderForPersona(
    bestPersona,
    userId,
    COMPLEXITY_TIERS[complexity],
  )

  return {
    persona: bestPersona,
    provider: resolved.provider,
    model: resolved.model,
    contextWindowSize: contextWindowSize ?? getContextWindow(resolved.provider, resolved.model),
    reason: `auto-routed: persona=${bestPersona.name}, complexity=${complexity}, scope_overlap=${bestScore}`,
  }
}

async function resolveProviderForPersona(
  persona: AgentDefinition,
  userId: string,
  minTier?: 'fast' | 'standard' | 'flagship',
): Promise<{ provider: string; model: string }> {
  const configs = await getUserProviders(userId)

  if (persona.defaultProvider) {
    const explicit = configs.find(
      (config) => config.provider === persona.defaultProvider && config.isEnabled,
    )
    if (explicit) {
      const model = persona.defaultModel ?? explicit.modelOverride ?? getDefaultModel(explicit.provider)
      return { provider: explicit.provider, model }
    }
  }

  const sorted = configs
    .filter((config) => config.isEnabled)
    .sort((a, b) => a.priority - b.priority)

  if (sorted.length === 0) {
    throw new Error('No providers configured. Add at least one provider in settings.')
  }

  const chosen = sorted[0]
  if (!chosen) {
    throw new Error('No providers configured. Add at least one provider in settings.')
  }
  const model = chosen.modelOverride
    ?? (minTier === 'fast' ? getCheapModel(chosen.provider) : getDefaultModel(chosen.provider))
    ?? 'auto'

  return { provider: chosen.provider, model }
}
