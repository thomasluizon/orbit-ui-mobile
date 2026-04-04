import { QueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false, // not applicable on mobile, but set explicitly
    },
    mutations: {
      retry: 1,
    },
  },
})

// Persist query cache to AsyncStorage for offline support
const CACHE_KEY = '@orbit/query-cache'

export async function persistQueryCache(): Promise<void> {
  try {
    const cache = queryClient.getQueryCache().getAll()
    const serializable = cache
      .filter((query) => query.state.status === 'success')
      .map((query) => ({
        queryKey: query.queryKey,
        state: {
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt,
        },
      }))
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(serializable))
  } catch {
    // Silently fail - cache persistence is best-effort
  }
}

export async function restoreQueryCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw) as Array<{
      queryKey: unknown[]
      state: { data: unknown; dataUpdatedAt: number }
    }>
    for (const entry of entries) {
      queryClient.setQueryData(entry.queryKey, entry.state.data, {
        updatedAt: entry.state.dataUpdatedAt,
      })
    }
  } catch {
    // Silently fail - cache restore is best-effort
  }
}
