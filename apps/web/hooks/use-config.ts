'use client'

import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { configKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { configCache } from '@/lib/config-cache'
import { fetchWithThrottle } from '@/lib/throttle-fetch'

async function fetchConfig(): Promise<unknown> {
  const response = await fetchWithThrottle(API.config.get)
  if (!response.ok) throw new Error(`Config request failed: ${response.status}`)
  return response.json()
}

export function useConfig() {
  const scope = useSyncExternalStore(configCache.subscribe, configCache.getSnapshot, configCache.getServerSnapshot)
  const query = useQuery({
    queryKey: configKeys.detail(scope.accountId, scope.generation),
    queryFn: ({ signal }) => configCache.fetch(scope, fetchConfig, signal),
    networkMode: 'offlineFirst',
    enabled: scope.accountId !== null,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  return {
    ...query,
    config: scope.config ?? DEFAULT_CONFIG,
    resolvedConfig: scope.config,
  }
}
