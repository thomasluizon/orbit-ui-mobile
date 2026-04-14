import { type ReactNode, useEffect, useRef, useState } from 'react'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient, restoreQueryCache, persistQueryCache, clearPersistedQueryCache } from './query-client'
import { useAuthStore } from '@/stores/auth-store'
import { AppState, type AppStateStatus, View, ActivityIndicator } from 'react-native'
import { createColors, getRuntimeTheme } from './theme'
import { ThemeProvider } from './theme-provider'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { useTranslation } from 'react-i18next'
import './i18n'

interface ProvidersProps {
  children: ReactNode
}

function OfflineManager() {
  const { pendingCount, isFlushing } = useOffline()
  const { t } = useTranslation()
  const { showInfo, showQueued, showSuccess } = useAppToast()
  const initializedRef = useRef(false)
  const previousPendingRef = useRef(0)
  const previousFlushingRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      previousPendingRef.current = pendingCount
      previousFlushingRef.current = isFlushing
      return
    }

    if (pendingCount > previousPendingRef.current) {
      showQueued(t('common.queued'))
    }

    if (!previousFlushingRef.current && isFlushing) {
      showInfo(t('common.syncing'))
    }

    if (previousFlushingRef.current && !isFlushing && pendingCount === 0 && previousPendingRef.current > 0) {
      showSuccess(t('common.synced'))
    }

    previousPendingRef.current = pendingCount
    previousFlushingRef.current = isFlushing
  }, [isFlushing, pendingCount, showInfo, showQueued, showSuccess, t])

  return null
}

function AuthInitializer({ children }: Readonly<{ children: ReactNode }>) {
  const initialize = useAuthStore((s) => s.initialize)
  const [ready, setReady] = useState(false)
  const runtimeTheme = getRuntimeTheme()
  const runtimeColors = createColors(runtimeTheme.scheme, runtimeTheme.themeMode)

  useEffect(() => {
    async function boot() {
      let isAuthenticated = false

      try {
        await initialize()
        isAuthenticated = useAuthStore.getState().isAuthenticated
      } catch {}

      if (isAuthenticated) {
        try { await restoreQueryCache() } catch {}
      } else {
        queryClient.clear()
        try { await clearPersistedQueryCache() } catch {}
      }

      setReady(true)
    }
    boot()
  }, [initialize])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        persistQueryCache()
      }

      if (nextState === 'active') {
        useAuthStore.getState().checkAuth().catch(() => {})
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: runtimeColors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={runtimeColors.primary} />
      </View>
    )
  }

  return (
    <ThemeProvider>
      <BottomSheetModalProvider>
        <OfflineManager />
        {children}
      </BottomSheetModalProvider>
    </ThemeProvider>
  )
}

export function Providers({ children }: Readonly<ProvidersProps>) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  )
}
