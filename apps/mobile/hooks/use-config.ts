import { useQuery } from '@tanstack/react-query'
import { configKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { DEFAULT_CONFIG, type AppConfig } from '@orbit/shared/types/config'
import { isFeatureEnabled } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// useConfig -- TanStack Query hook for the global app config
// ---------------------------------------------------------------------------

async function fetchConfig(): Promise<AppConfig> {
  try {
    return await apiClient<AppConfig>(API.config.get)
  } catch {
    // Silently fall back to defaults on error
    return DEFAULT_CONFIG
  }
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
export { isFeatureEnabled }
