'use client'

import { useQuery } from '@tanstack/react-query'
import { configKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { DEFAULT_CONFIG, type AppConfig, type FeatureFlag } from '@orbit/shared/types/config'
import type { PlanType } from '@orbit/shared/types/profile'

// ---------------------------------------------------------------------------
// useConfig -- TanStack Query hook for the global app config
// ---------------------------------------------------------------------------

async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(API.config.get)
  if (!res.ok) {
    // Silently fall back to defaults on error
    return DEFAULT_CONFIG
  }
  return res.json()
}

export function useConfig() {
  const query = useQuery({
    queryKey: configKeys.detail(),
    queryFn: fetchConfig,
    staleTime: 30 * 60 * 1000, // 30 minutes -- config rarely changes
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: DEFAULT_CONFIG,
  })

  const config = query.data ?? DEFAULT_CONFIG

  return {
    ...query,
    config,
  }
}

// ---------------------------------------------------------------------------
// Feature flag helper
// ---------------------------------------------------------------------------

/**
 * Check if a feature is enabled for the given user plan.
 * Returns true if the feature exists, is enabled, and either has no plan
 * restriction or the user is on Pro.
 */
export function isFeatureEnabled(
  config: AppConfig,
  key: string,
  userPlan: PlanType,
): boolean {
  const flag: FeatureFlag | undefined = config.features[key]
  if (!flag?.enabled) return false
  if (flag.plan === null) return true // No plan restriction
  return userPlan === 'pro'
}
