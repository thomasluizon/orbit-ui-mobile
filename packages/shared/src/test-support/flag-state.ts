import type { FeatureKey } from '../types/config'

const enabledFlags = new Set<FeatureKey>()

/** The test double of `useFlag`: every flag is off until a test turns it on, as `resolveFlag` answers when the config is absent. */
export function readTestFlag(key: FeatureKey): boolean {
  return enabledFlags.has(key)
}

export function enableTestFlags(...keys: FeatureKey[]): void {
  for (const key of keys) enabledFlags.add(key)
}

export function resetTestFlags(): void {
  enabledFlags.clear()
}
