import { focusManager, QueryClient } from '@tanstack/react-query'
import { configureAccountQueryDefaults, shouldRetryQuery, queryRetryDelay } from '@orbit/shared/query'

focusManager.setEventListener((handleFocus) => {
  if (typeof window === 'undefined') return
  const refreshFocus = () => handleFocus()
  window.addEventListener('focus', refreshFocus)
  window.addEventListener('visibilitychange', refreshFocus)
  return () => {
    window.removeEventListener('focus', refreshFocus)
    window.removeEventListener('visibilitychange', refreshFocus)
  }
})

export function getQueryGcTime(browserGcTime: number): number {
  // WHY: Finite query timers retain server render caches and their request context. https://github.com/thomasluizon/orbit-tickets/issues/1735
  return typeof document === 'undefined' ? Infinity : browserGcTime
}

export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: getQueryGcTime(24 * 60 * 60 * 1000),
        retry: (failureCount, error) => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) return false
          return shouldRetryQuery(failureCount, error)
        },
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  })
  configureAccountQueryDefaults(queryClient)
  return queryClient
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient(): QueryClient {
  if (!('document' in globalThis)) {
    return createQueryClient()
  }
  browserQueryClient ??= createQueryClient()
  return browserQueryClient
}
