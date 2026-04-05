import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,      // 5 minutes default
        gcTime: 24 * 60 * 60 * 1000,    // 24 hours (keep in cache for offline)
        retry: (failureCount, error) => {
          // Don't retry when offline
          if (typeof navigator !== 'undefined' && !navigator.onLine) return false // NOSONAR - SSR guard
          // Don't retry auth errors
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
}

// Singleton for client-side use
let browserQueryClient: QueryClient | undefined

export function getQueryClient(): QueryClient {
  if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') { // NOSONAR - SSR guard
    // Server: always create a new client
    return createQueryClient()
  }
  // Browser: reuse the same client
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient()
  }
  return browserQueryClient
}
