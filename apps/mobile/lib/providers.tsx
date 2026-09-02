import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist'
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
} from '@expo-google-fonts/geist-mono'
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
} from '@expo-google-fonts/space-grotesk'
import { queryClient, restoreQueryCache, persistQueryCache, clearPersistedQueryCache } from './query-client'
import { syncWidgetData } from './orbit-widget'
import { useAuthStore } from '@/stores/auth-store'
import { AppState, type AppStateStatus, View, ActivityIndicator } from 'react-native'
import { createTokensV2, getRuntimeTheme } from './theme'
import { ThemeProvider } from './theme-provider'
import { useOffline } from '@/hooks/use-offline'
import { subscribeDroppedMutations, getMutationScope } from '@/lib/offline-mutations'
import { useAppToast } from '@/hooks/use-app-toast'
import { useTranslation } from 'react-i18next'
import { useOnboardingDraftHydrated } from '@/stores/onboarding-draft-store'
import { useGlobalSearchParams } from 'expo-router'
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated'
import {
  captureBuildEnabled,
  captureTupleKey,
  resolveCapturePreferences,
  type CapturePreferences,
} from './capture-mode'
import { pinCaptureAnimationDurations } from './capture-animation-pin'
import { i18n } from './i18n'

void SplashScreen.preventAutoHideAsync()
if (captureBuildEnabled) pinCaptureAnimationDurations()

function syncWidgetDataSafely() {
  void syncWidgetData().catch(() => {})
}

interface ProvidersProps {
  children: ReactNode
}

const CaptureReadinessContext = createContext(true)

export function useCaptureReady() {
  return useContext(CaptureReadinessContext)
}

function OfflineManager() {
  const { pendingCount, isFlushing } = useOffline()
  const { t } = useTranslation()
  const { showInfo, showQueued, showSuccess, showError } = useAppToast()
  const initializedRef = useRef(false)
  const previousPendingRef = useRef(0)
  const previousFlushingRef = useRef(false)

  useEffect(() => {
    return subscribeDroppedMutations((dropped) => {
      const scope = getMutationScope(dropped.type)
      if (!scope) return

      showError(
        t('common.syncDropped', {
          item: t(`common.syncEntity.${scope}`),
        }),
      )
    })
  }, [showError, t])

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

function AuthInitializer({
  capturePreferences,
  children,
}: Readonly<{
  capturePreferences: CapturePreferences | null
  children: ReactNode
}>) {
  const initialize = useAuthStore((s) => s.initialize)
  const captureTuple = captureTupleKey(capturePreferences)
  const [appliedCaptureTuple, setAppliedCaptureTuple] = useState<string | null>(null)
  /** Derived during render, never flipped by an effect: see captureTupleKey. */
  const ready = appliedCaptureTuple === captureTuple
  const onboardingDraftHydrated = useOnboardingDraftHydrated()
  const runtimeTheme = getRuntimeTheme()
  const runtimeTokens = createTokensV2(runtimeTheme.scheme, runtimeTheme.themeMode)
  /** Expo Router's warm-link transition must retain its navigator while the next tuple applies. */
  const [hasRenderedApp, setHasRenderedApp] = useState(false)
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
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  })

  useEffect(() => {
    /**
     * A tuple that changes mid-boot abandons the boot in flight. Without this, the older boot could
     * resolve last and publish its own tuple as applied, gating a render that is already correct.
     */
    let abandoned = false
    async function boot() {
      let isAuthenticated = false

      try {
        await initialize()
        isAuthenticated = useAuthStore.getState().isAuthenticated
      } catch {}

      if (capturePreferences) {
        await i18n.changeLanguage(capturePreferences.locale)
      }

      if (isAuthenticated) {
        try { await restoreQueryCache() } catch {}
        syncWidgetDataSafely()
      } else {
        queryClient.clear()
        try { await clearPersistedQueryCache() } catch {}
      }

      if (!abandoned) setAppliedCaptureTuple(captureTuple)
    }
    void boot()
    return () => {
      abandoned = true
    }
  }, [captureTuple, capturePreferences, initialize])

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

  /** Sticky on the first ready render, independently of asynchronous splash cleanup. */
  if (appReady && !hasRenderedApp) setHasRenderedApp(true)

  useEffect(() => {
    if (!appReady) return
    void SplashScreen.hideAsync()
  }, [appReady])

  if (!appReady && !hasRenderedApp) {
    return (
      <View style={{ flex: 1, backgroundColor: runtimeTokens.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={runtimeTokens.primary} />
      </View>
    )
  }

  return (
    <CaptureReadinessContext.Provider value={appReady}>
      <ThemeProvider captureTheme={capturePreferences?.theme ?? null}>
        <View style={{ flex: 1 }}>
          <OfflineManager />
          {children}
          {!appReady ? (
            <View
              pointerEvents="auto"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: runtimeTokens.bg,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <ActivityIndicator size="large" color={runtimeTokens.primary} />
            </View>
          ) : null}
        </View>
      </ThemeProvider>
    </CaptureReadinessContext.Provider>
  )
}

export function Providers({ children }: Readonly<ProvidersProps>) {
  const parameters = useGlobalSearchParams<{
    captureLocale?: string | string[]
    captureTheme?: string | string[]
  }>()
  const captureLocale = Array.isArray(parameters.captureLocale)
    ? parameters.captureLocale[0]
    : parameters.captureLocale
  const captureTheme = Array.isArray(parameters.captureTheme)
    ? parameters.captureTheme[0]
    : parameters.captureTheme
  const capturePreferences = useMemo(
    () => resolveCapturePreferences(captureBuildEnabled, { captureLocale, captureTheme }),
    [captureLocale, captureTheme],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ReducedMotionConfig
        mode={captureBuildEnabled ? ReduceMotion.Always : ReduceMotion.System}
      />
      <AuthInitializer capturePreferences={capturePreferences}>
        {children}
      </AuthInitializer>
    </QueryClientProvider>
  )
}
