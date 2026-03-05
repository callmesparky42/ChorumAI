import type { FullProviderConfig } from './index'
import { getCheapModel } from './registry'

/**
 * Phase 4 provider utility:
 * pick the cheapest usable config from already loaded provider configs.
 */
export function getCheapestProviderFromConfigs(
  configs: FullProviderConfig[],
): FullProviderConfig | null {
  const enabled = configs.filter((config) => config.apiKey.length > 0)
  if (enabled.length === 0) return null

  const sorted = [...enabled].sort((a, b) => {
    const aLocal = a.isLocal ? 0 : 1
    const bLocal = b.isLocal ? 0 : 1
    if (aLocal !== bLocal) return aLocal - bLocal
    return a.provider.localeCompare(b.provider)
  })

  const selected = sorted[0]
  if (!selected) return null

  return {
    ...selected,
    model: selected.model || getCheapModel(selected.provider) || 'auto',
  }
}

/**
 * Backward-compatible signature from v1. Phase 4 callers should use
 * getCheapestProviderFromConfigs(...) after loading provider rows via agents layer.
 */
export async function getCheapestProvider(_userId: string): Promise<FullProviderConfig | null> {
  return null
}
