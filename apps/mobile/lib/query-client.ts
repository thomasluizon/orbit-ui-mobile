import { configKeys, configureAccountQueryDefaults, habitKeys, shouldRetryQuery } from '@orbit/shared/query'
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

/**
 * Bridges AppState to TanStack Query focus so foreground refetching and
 * background interval pausing follow the native application lifecycle.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active')
  })
  return () => subscription.remove()
})

/** Bridges NetInfo to TanStack Query so reconnect behavior follows native connectivity. */
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected)
  })
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
})

configureAccountQueryDefaults(queryClient)

const CACHE_KEY_PREFIX = '@orbit/query-cache'
const LEGACY_CACHE_KEY = '@orbit/query-cache'

/**
 * Restored entries bypass hook validation. Bump this version when a persisted
 * response schema changes shape or adds validation so restore discards older
 * caches containing responses the current UI cannot trust.
 */
export const QUERY_CACHE_VERSION = 3

let cacheScopeUserId: string | null = null

function getCacheKey(): string | null {
  return cacheScopeUserId ? `${CACHE_KEY_PREFIX}:${cacheScopeUserId}` : null
}

/**
 * Scopes the persisted query cache to a user so an account never restores
 * another account's cached data. Pass the userId on login, or null on logout.
 * Switching scope clears the previous account's persisted cache.
 */
export async function setQueryCacheScope(userId: string | null): Promise<void> {
  if (cacheScopeUserId === userId) return
  const previousKey = getCacheKey()
  cacheScopeUserId = userId
  try {
    if (previousKey) await AsyncStorage.removeItem(previousKey)
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY)
  } catch {}
}

export async function persistQueryCache({ discardHabitSearches = false } = {}): Promise<void> {
  if (discardHabitSearches) {
    const filters = { queryKey: habitKeys.searches() }
    for (const query of queryClient.getQueryCache().findAll(filters)) query.reset()
    queryClient.removeQueries(filters)
  }
  const key = getCacheKey()
  if (!key) return
  try {
    const cache = queryClient.getQueryCache().getAll()
    const serializable: {
      queryKey: readonly unknown[]
      state: { data: unknown; dataUpdatedAt: number }
    }[] = []
    for (const query of cache) {
      if (query.state.status !== 'success') continue
      if (query.queryKey[0] === configKeys.all[0]) continue
      serializable.push({
        queryKey: query.queryKey,
        state: {
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt,
        },
      })
    }
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ version: QUERY_CACHE_VERSION, entries: serializable }),
    )
  } catch {}
}

export async function clearPersistedQueryCache(): Promise<void> {
  const key = getCacheKey()
  try {
    if (key) await AsyncStorage.removeItem(key)
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY)
  } catch {}
}

export async function restoreQueryCache(): Promise<void> {
  const key = getCacheKey()
  if (!key) return
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      version?: number
      entries?: { queryKey: unknown[]; state: { data: unknown; dataUpdatedAt: number } }[]
    }
    if (parsed.version !== QUERY_CACHE_VERSION || !Array.isArray(parsed.entries)) {
      await AsyncStorage.removeItem(key)
      return
    }
    for (const entry of parsed.entries) {
      if (entry.queryKey[0] === configKeys.all[0]) continue
      queryClient.setQueryData(entry.queryKey, entry.state.data, {
        updatedAt: entry.state.dataUpdatedAt,
      })
    }
  } catch {}
}
