import type { FeatureKey } from '@orbit/shared/types/config'
import { resolveFlag } from '@orbit/shared/utils'
import { useConfig } from './use-config'

export function useFlag(key: FeatureKey): boolean {
  return resolveFlag(useConfig().resolvedConfig, key)
}
