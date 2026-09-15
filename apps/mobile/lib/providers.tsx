import { type ReactNode, useEffect, useState } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { reconcileSessionOnForeground } from './session-resume'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  useFonts,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from '@expo-google-fonts/rubik'
import {
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto'
import { queryClient, restoreQueryCache, persistQueryCache, clearPersistedQueryCache } from './query-client'
import { syncWidgetData } from './orbit-widget'
import { useAuthStore } from '@/stores/auth-store'
import { AppState, type AppStateStatus, View, ActivityIndicator } from 'react-native'
import { createTokensV2, getRuntimeTheme } from './theme'
import { ThemeProvider } from './theme-provider'
import { useOffline } from '@/hooks/use-offline'
import { useOnboardingDraftHydrated } from '@/stores/onboarding-draft-store'
import './i18n'

void SplashScreen.preventAutoHideAsync()

function syncWidgetDataSafely() {
  void syncWidgetData().catch(() => {})
}

interface ProvidersProps {
  children: ReactNode
}

function OfflineManager() {
  useOffline(true)
  return null
}

function AuthInitializer({ children }: Readonly<{ children: ReactNode }>) {
  const initialize = useAuthStore((s) => s.initialize)
  const [ready, setReady] = useState(false)
  const onboardingDraftHydrated = useOnboardingDraftHydrated()
  const runtimeTheme = getRuntimeTheme()
  const runtimeTokens = createTokensV2(runtimeTheme.scheme, runtimeTheme.themeMode)
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  })

  useEffect(() => {
    async function boot() {
      let isAuthenticated = false

      try {
        await initialize()
        isAuthenticated = useAuthStore.getState().isAuthenticated
      } catch {}

      if (isAuthenticated) {
        try { await restoreQueryCache() } catch {}
        syncWidgetDataSafely()
      } else {
        queryClient.clear()
        try { await clearPersistedQueryCache() } catch {}
      }

      setReady(true)
    }
    void boot()
  }, [initialize])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void persistQueryCache()
      }

      if (nextState === 'active') {
        reconcileSessionOnForeground()
          .then(syncWidgetDataSafely)
          .catch(() => {})
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [])

  const appReady = ready && fontsLoaded && onboardingDraftHydrated

  useEffect(() => {
    if (ready && fontsLoaded && onboardingDraftHydrated) void SplashScreen.hideAsync()
  }, [ready, fontsLoaded, onboardingDraftHydrated])

  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: runtimeTokens.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={runtimeTokens.primary} />
      </View>
    )
  }

  return (
    <ThemeProvider>
      <View style={{ flex: 1 }}>
        <OfflineManager />
        {children}
      </View>
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
