'use client'

import { resolveFlag } from '@orbit/shared/utils'
import { useConfig } from './use-config'

export function useFlag(key: string): boolean {
  return resolveFlag(useConfig().resolvedConfig, key)
}
