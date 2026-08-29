import { useEffect, useMemo, useRef } from 'react'
import { BackHandler, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from 'expo-router'
import { type Theme as NavigationTheme } from 'expo-router/react-navigation'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { Providers, useCaptureReady } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useAdMob } from '@/hooks/use-ad-mob'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion } from '@/lib/motion'
import { syncWidgetTheme } from '@/lib/orbit-widget'
import {
  dismissOrFallback,
  getAndroidBackFallbackRoute,
} from '@/lib/back-navigation'
import { dismissTopOverlay } from '@/lib/overlay-stack'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import {
  getReferralLevelMilestone,
  getMilestoneShareStreakKey,
  getMilestoneShareAchievementKey,
  getReviewMomentLevelKey,
  MARKETING_CONSENT_MILESTONE_KEY,
} from '@orbit/shared/stores'
import { formatAPIDate, isShareableAchievement } from '@orbit/shared/utils'
import {
  isReviewMomentEligible,
  useReviewReminderStore,
} from '@/stores/review-reminder-store'
import { useLiveOnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'
import { BottomTabBar, type BottomTabId } from '@/components/navigation/bottom-tab-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { Fab } from '@/components/ui/fab'
import { Plus } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { useTourTarget } from '@/hooks/use-tour-target'
import { type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { OverlayLayer } from '@/components/global-overlays'
import * as Sentry from '@sentry/react-native'
import { AppToast } from '@/components/ui/app-toast'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { captureError } from '@/lib/sentry'
import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import {
  captureBuildEnabled,
  captureRequestProbeIdFromUrl,
  captureRouteProbeId,
  shouldExposeOnboardingRoute,
} from '@/lib/capture-mode'

const SLIDE_FROM_RIGHT_SCREENS = [
  'preferences',
  'ai-settings',
  'advanced',
  'about',
  'support',
  'achievements',
  'streak',
  'upgrade',
  'retrospective',
  'wrapped',
  'calendar-sync',
  'step-up',
] as const

function RootStackScreens({
  screenBackgroundColor,
}: Readonly<{ screenBackgroundColor: string }>) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const onboardingLocallyDone = useOnboardingDraftStore(
    (s) => s.onboardingLocallyDone,
  )

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: captureBuildEnabled ? 'none' : 'fade_from_bottom',
        animationDuration: captureBuildEnabled
          ? 0
          : mobileMotion.presets['route-push'].enterDuration,
        animationMatchesGesture: true,
        animationTypeForReplace: 'push',
        contentStyle: { backgroundColor: screenBackgroundColor },
      }}
    >
      <Stack.Protected
        guard={shouldExposeOnboardingRoute(
          captureBuildEnabled,
          isAuthenticated,
          onboardingLocallyDone,
        )}
      >
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen
          name="login"
          options={{
            animation: captureBuildEnabled ? 'none' : 'fade',
            gestureEnabled: false,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat"
          options={{
            animation: captureBuildEnabled ? 'none' : 'slide_from_right',
          }}
        />
        {SLIDE_FROM_RIGHT_SCREENS.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              animation: captureBuildEnabled ? 'none' : 'slide_from_right',
            }}
          />
        ))}
      </Stack.Protected>

      {/* Public, unguarded screens MUST stay declared LAST: Expo Router anchors the
          stack to the first AVAILABLE screen, so after login flips the guards the
          user lands on (tabs), not /privacy. Regression from #400; fix #431.
          https://docs.expo.dev/router/advanced/protected/ */}
      <Stack.Screen
        name="privacy"
        options={{ animation: captureBuildEnabled ? 'none' : 'fade' }}
      />
      <Stack.Screen
        name="terms"
        options={{ animation: captureBuildEnabled ? 'none' : 'fade' }}
      />
      <Stack.Screen name="r" />
      <Stack.Screen
        name="auth-callback"
        options={{
          animation: captureBuildEnabled ? 'none' : 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  )
}

function RootLayoutNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { from } = useGlobalSearchParams<{ from?: string | string[] }>()
  const linkingUrl = Linking.useLinkingURL()
  const segments = useSegments()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const captureReady = useCaptureReady()
  const { profile } = useProfile()
  const { initialize: initializeAdMob } = useAdMob()
  useTimezoneAutoSync(profile)
  const hasProAccess = useHasProAccess()
  const totalHabitCount = useTotalHabitCount()
  const { currentTheme, currentScheme, surfaces } = useAppTheme()
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const todayFabHidden = useUIStore((s) => s.todayFabHidden)
  useOnboardingFlush()

  const topSegment = segments[0] as string | undefined
  const captureProbeId = captureRouteProbeId(pathname, topSegment)
  const captureRequestId = captureRequestProbeIdFromUrl(
    captureBuildEnabled,
    linkingUrl,
  )
  const hideAppShellChrome =
    topSegment === 'login' ||
    topSegment === 'auth-callback' ||
    topSegment === 'chat' ||
    topSegment === 'step-up' ||
    topSegment === 'upgrade' ||
    topSegment === 'privacy' ||
    topSegment === 'terms' ||
    topSegment === 'r'

  const showBottomNav = isAuthenticated && !hideAppShellChrome
  const androidBackFallbackRoute = useMemo(
    () =>
      getAndroidBackFallbackRoute(pathname, {
        isAuthenticated,
        upgradeFrom: from,
      }),
    [from, isAuthenticated, pathname],
  )

  const handleCreate = useMemo(
    () => () => {
      if (!hasProAccess && totalHabitCount >= 10) {
        router.push(buildUpgradeHref(pathname || '/'))
        return
      }

      setShowCreateModal(true)
    },
    [
      hasProAccess,
      pathname,
      router,
      setShowCreateModal,
      totalHabitCount,
    ],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    syncWidgetTheme(createTokensV2(currentScheme, currentTheme)).catch(() => {})
  }, [currentScheme, currentTheme, isAuthenticated])

  useEffect(() => {
    void initializeAdMob()
  }, [initializeAdMob])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (dismissTopOverlay('system-back')) {
          return true
        }

        if (!androidBackFallbackRoute) return false

        dismissOrFallback(router, androidBackFallbackRoute)
        return true
      },
    )

    return () => subscription.remove()
  }, [androidBackFallbackRoute, router])

  return (
    <>
      <StatusBar
        animated={!captureBuildEnabled}
        hidden={captureBuildEnabled}
        style={currentTheme === 'dark' ? 'light' : 'dark'}
      />

      <View style={{ flex: 1 }}>
        {showBottomNav ? (
          <Shell412
            tabBar={<AppBottomTabBar pathname={pathname} />}
            fab={pathname === '/' && !todayFabHidden
              ? <AppCreateFab onCreate={handleCreate} />
              : undefined}
          >
            <RootStackScreens
              screenBackgroundColor={surfaces.screen.backgroundColor}
            />
          </Shell412>
        ) : (
          <Shell412 nav={false}>
            <RootStackScreens
              screenBackgroundColor={surfaces.screen.backgroundColor}
            />
          </Shell412>
        )}

        {captureBuildEnabled && captureReady ? (
          <>
            <View
              accessibilityLabel={captureProbeId}
              accessible
              collapsable={false}
              importantForAccessibility="yes"
              pointerEvents="none"
              style={styles.captureProbe}
              testID={captureProbeId}
            />
            {captureRequestId ? (
              <View
                accessibilityLabel={captureRequestId}
                accessible
                collapsable={false}
                importantForAccessibility="yes"
                pointerEvents="none"
                style={styles.captureProbe}
                testID={captureRequestId}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {isAuthenticated ? <GlobalOverlays profile={profile} /> : null}
      <AppToast />
    </>
  )
}

function GlobalOverlays({
  profile,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
}>) {
  const streakFreezeRef = useRef<StreakFreezeCelebrationHandle>(null)
  const hasProAccess = profile?.hasProAccess ?? false
  const canViewGamification = profile?.canViewGamification ?? false
  const gamification = useGamificationProfile(canViewGamification)
  const armReferralPrompt = useReferralPromptStore((s) => s.armReferralPrompt)
  const armMilestoneSharePrompt = useReferralPromptStore(
    (s) => s.armMilestoneSharePrompt,
  )
  const armReviewPrompt = useReferralPromptStore((s) => s.armReviewPrompt)
  const armConsentPrompt = useReferralPromptStore((s) => s.armConsentPrompt)
  useEffect(() => {
    if (
      profile?.hasCompletedOnboarding &&
      profile.hasCompletedTour &&
      profile.hasSeenImportPrompt &&
      profile.marketingEmailConsent === null
    ) {
      armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    }
  }, [
    profile?.hasCompletedOnboarding,
    profile?.hasCompletedTour,
    profile?.hasSeenImportPrompt,
    profile?.marketingEmailConsent,
    armConsentPrompt,
  ])

  const pendingOnboardingAnswers = useOnboardingDraftStore((s) =>
    s.hasPendingAnswers(),
  )
  const liveOnboardingActions = useLiveOnboardingActions()
  const showRetainedOnboarding = useRetainedOnboardingGuard(
    profile,
    pendingOnboardingAnswers,
  )

  useEffect(() => {
    if (gamification.leveledUp && gamification.newLevel) {
      armReferralPrompt(getReferralLevelMilestone(gamification.newLevel))
      if (
        isReviewMomentEligible(
          useReviewReminderStore.getState(),
          profile?.hasCompletedOnboarding ?? false,
          formatAPIDate(new Date()),
        )
      ) {
        armReviewPrompt(getReviewMomentLevelKey(gamification.newLevel))
      }
    }
  }, [
    gamification.leveledUp,
    gamification.newLevel,
    armReferralPrompt,
    armReviewPrompt,
    profile?.hasCompletedOnboarding,
  ])

  useEffect(() => {
    const crossedStreak = gamification.crossedStreakMilestones.at(-1) ?? null
    const shareableAchievement = gamification.newAchievements.find(
      isShareableAchievement,
    )
    const achievementKey = shareableAchievement
      ? getMilestoneShareAchievementKey(shareableAchievement.id)
      : null
    const candidateKey =
      crossedStreak !== null ? getMilestoneShareStreakKey(crossedStreak) : achievementKey
    if (candidateKey) {
      armMilestoneSharePrompt(candidateKey)
    }
  }, [
    gamification.crossedStreakMilestones,
    gamification.newAchievements,
    armMilestoneSharePrompt,
  ])

  return (
    <OverlayLayer
      hasCompletedOnboarding={profile?.hasCompletedOnboarding ?? false}
      hasProAccess={hasProAccess}
      canViewGamification={canViewGamification}
      showRetainedOnboarding={showRetainedOnboarding}
      onboardingActions={liveOnboardingActions}
      leveledUp={gamification.leveledUp}
      newLevel={gamification.newLevel}
      onClearLevelUp={gamification.clearLevelUp}
      streakFreezeRef={streakFreezeRef}
    />
  )
}

function RootLayoutContent() {
  const { currentScheme, currentTheme, surfaces } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const navigationTheme = useMemo<NavigationTheme>(() => {
    const baseTheme = currentTheme === 'dark' ? DarkTheme : DefaultTheme

    return {
      ...baseTheme,
      dark: currentTheme === 'dark',
      colors: {
        ...baseTheme.colors,
        primary: tokens.primary,
        background: surfaces.screen.backgroundColor,
        card: surfaces.elevated.backgroundColor,
        text: tokens.fg1,
        border: tokens.hairline,
        notification: tokens.primary,
      },
    }
  }, [
    tokens.hairline,
    tokens.primary,
    tokens.fg1,
    currentTheme,
    surfaces.elevated.backgroundColor,
    surfaces.screen.backgroundColor,
  ])

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View
        style={[
          styles.shellRoot,
          { backgroundColor: surfaces.screen.backgroundColor },
        ]}
      >
        <RootLayoutNav />
        <UpgradeRequiredScreen />
      </View>
    </NavigationThemeProvider>
  )
}

/**
 * Wraps the v8 BottomTabBar primitive in a router-aware container. Lives in
 * the root layout so the tab bar is shown over every (tabs) screen exactly
 * like the previous BottomNav. Tab labels come from the i18n catalog so
 * pt-BR users see localized strings.
 */
function AppBottomTabBar({ pathname }: Readonly<{ pathname: string }>) {
  const router = useRouter()
  const setActiveView = useUIStore((s) => s.setActiveView)

  const active: BottomTabId = useMemo(() => {
    if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return 'calendario'
    if (pathname === '/progress' || pathname.startsWith('/progress/')) return 'progresso'
    if (pathname === '/profile' || pathname.startsWith('/profile/')) return 'perfil'
    return 'hoje'
  }, [pathname])

  const handleTab = (id: BottomTabId) => {
    if (id === 'hoje') {
      setActiveView('today')
      router.navigate('/')
      return
    }
    if (id === 'calendario') router.navigate('/calendar')
    else if (id === 'progresso') router.navigate('/progress')
    else router.navigate('/profile')
  }

  return <BottomTabBar active={active} onTab={handleTab} />
}

function AppCreateFab({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const { t } = useTranslation()
  const fabRef = useRef<View>(null)
  useTourTarget('tour-fab-button', fabRef)

  return (
    <View ref={fabRef} collapsable={false}>
      <Fab label={t('nav.create')} onClick={onCreate}>
        <Plus size={24} strokeWidth={2} />
      </Fab>
    </View>
  )
}

const styles = StyleSheet.create({
  shellRoot: {
    flex: 1,
    overflow: 'hidden',
  },
  captureProbe: {
    height: 1,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
})

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <RootLayoutContent />
      </Providers>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)

export function ErrorBoundary({ error, retry }: Readonly<ErrorBoundaryProps>) {
  useEffect(() => {
    captureError(error)
  }, [error])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorScreen error={error} retry={() => void retry()} />
    </GestureHandlerRootView>
  )
}
