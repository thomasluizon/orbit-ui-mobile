import { type ReactNode, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient, restoreQueryCache, persistQueryCache } from './query-client'
import { useAuthStore } from '@/stores/auth-store'
import { AppState, type AppStateStatus } from 'react-native'

interface ProvidersProps {
  children: ReactNode
}

function AuthInitializer({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function boot() {
      await restoreQueryCache()
      await initialize()
      setReady(true)
    }
    boot()
  }, [initialize])

  // Persist query cache when app goes to background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        persistQueryCache()
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [])

  if (!ready) return null

  return <>{children}</>
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  )
}
