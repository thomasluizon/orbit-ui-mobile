import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

// Bridge React Native AppState → TanStack Query focus manager so that
// `refetchOnWindowFocus` fires on app foreground and `refetchInterval`
// correctly pauses while backgrounded.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active')
  })
  return () => subscription.remove()
})

// Bridge NetInfo → TanStack Query online manager so offline polling pauses
// and `refetchOnReconnect` fires on reconnect.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected)
  })
})

// Track last known AppState/online state synchronously for guards below.
let currentAppStateStatus: AppStateStatus = AppState.currentState
AppState.addEventListener('change', (status) => {
  currentAppStateStatus = status
})

let currentOnline = true
NetInfo.addEventListener((state) => {
  currentOnline = !!state.isConnected
})

export function isAppActive(): boolean {
  return currentAppStateStatus === 'active'
}

export function isOnline(): boolean {
  return currentOnline
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes (matches web)
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (matches web, supports offline)
      retry: (failureCount, error) => {
        // Don't retry on 401 (auth errors)
        if (error instanceof Error && error.message.includes('401')) return false
        return failureCount < 3
      },
      // Bridged to AppState above, so "window focus" == "app foregrounded".
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
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

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY)
  } catch {
    // Silently fail - cache clearing is best-effort
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
