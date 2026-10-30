import { captureException } from '@sentry/nextjs'
import { extractBackendStatus } from '@orbit/shared/utils/error-utils'
import { focusManager, QueryCache, QueryClient } from '@tanstack/react-query'
import { configKeys, configureAccountQueryDefaults, shouldRetryQuery, queryRetryDelay } from '@orbit/shared/query'
import { getQueryGcTime } from './query-gc-time'

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

export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === configKeys.all[0] && extractBackendStatus(error) !== 401) captureException(error)
      },
    }),
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
