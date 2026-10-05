import { QueryClient } from '@tanstack/react-query'
import { configureAccountQueryDefaults, shouldRetryQuery } from '@orbit/shared/query'

export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: (failureCount, error) => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) return false
          return shouldRetryQuery(failureCount, error)
        },
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
