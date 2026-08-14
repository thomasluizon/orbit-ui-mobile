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
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes('401')) return false
        return failureCount < 3
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
})

const CACHE_KEY_PREFIX = '@orbit/query-cache'
const LEGACY_CACHE_KEY = '@orbit/query-cache'

/**
 * Version stamp for the persisted query cache. Restored entries bypass the
 * hooks' Zod parsing, so a cache written by an older build can carry response
 * shapes the current UI no longer tolerates. Bump this whenever a persisted
 * response schema changes shape; mismatched caches are discarded on restore.
 */
export const QUERY_CACHE_VERSION = 2

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

export async function persistQueryCache(): Promise<void> {
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
      queryClient.setQueryData(entry.queryKey, entry.state.data, {
        updatedAt: entry.state.dataUpdatedAt,
      })
    }
  } catch {}
}
