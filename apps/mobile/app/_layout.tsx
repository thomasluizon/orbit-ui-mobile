import { useEffect, lazy, Suspense, useMemo, useRef } from 'react'
import { BackHandler, Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import Constants from 'expo-constants'
import { Providers } from '@/lib/providers'
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
} from '@orbit/shared/stores'
import { formatAPIDate, isShareableAchievement } from '@orbit/shared/utils'
import {
  isReviewMomentEligible,
  useReviewReminderStore,
} from '@/stores/review-reminder-store'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { BottomTabBar, type BottomTabId } from '@/components/navigation/bottom-tab-bar'
import { useTourTarget } from '@/hooks/use-tour-target'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { ReviewMomentSheet } from '@/components/review-moment/review-moment-sheet'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import * as Sentry from '@sentry/react-native'
import { AppToast } from '@/components/ui/app-toast'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'
import { captureError } from '@/lib/sentry'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'

const isExpoGo = Constants.appOwnership === 'expo'
const PushPrompt = isExpoGo
  ? () => null
  : lazy(() =>
      import('@/components/ui/push-prompt').then((m) => ({
        default: m.PushPrompt,
      })),
    )

const SLIDE_FROM_RIGHT_SCREENS = [
  'preferences',
  'ai-settings',
  'public-profile',
  'advanced',
  'about',
  'support',
  'achievements',
  'streak',
  'upgrade',
  'retrospective',
  'wrapped',
  'calendar-sync',
  'social',
  'accountability-pair',
  'social/challenges',
  'social/challenges/[id]',
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
        animation: 'fade_from_bottom',
        animationDuration: mobileMotion.presets['route-push'].enterDuration,
        animationMatchesGesture: true,
        animationTypeForReplace: 'push',
        contentStyle: { backgroundColor: screenBackgroundColor },
      }}
    >
      <Stack.Screen name="privacy" options={{ animation: 'fade' }} />
      <Stack.Screen name="terms" options={{ animation: 'fade' }} />
      <Stack.Screen name="r" />
      <Stack.Screen
        name="auth-callback"
        options={{ animation: 'fade', gestureEnabled: false }}
      />

      <Stack.Protected guard={!isAuthenticated && !onboardingLocallyDone}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen
          name="login"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
        {SLIDE_FROM_RIGHT_SCREENS.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ animation: 'slide_from_right' }}
          />
        ))}
      </Stack.Protected>
    </Stack>
  )
}

function RootLayoutNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { from } = useGlobalSearchParams<{ from?: string | string[] }>()
  const segments = useSegments()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { profile } = useProfile()
  const { initialize: initializeAdMob } = useAdMob()
  useTimezoneAutoSync(profile)
  const hasProAccess = useHasProAccess()
  const totalHabitCount = useTotalHabitCount()
  const { currentTheme, currentScheme, surfaces } = useAppTheme()
  const activeView = useUIStore((s) => s.activeView)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
  useOnboardingFlush()

  const topSegment = segments[0] as string | undefined
  const hideAppShellChrome =
    topSegment === 'login' ||
    topSegment === 'auth-callback' ||
    topSegment === 'chat' ||
    topSegment === 'upgrade' ||
    topSegment === 'privacy' ||
    topSegment === 'terms' ||
    topSegment === 'r'

  const showBottomNav = isAuthenticated && !hideAppShellChrome
  const showSharedCelebrations = pathname !== '/'
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
      if (activeView === 'goals') {
        if (!hasProAccess) {
          router.push(buildUpgradeHref(pathname || '/'))
          return
        }
        setShowCreateGoalModal(true)
        return
      }

      if (!hasProAccess && totalHabitCount >= 10) {
        router.push(buildUpgradeHref(pathname || '/'))
        return
      }

      setShowCreateModal(true)
    },
    [
      activeView,
      hasProAccess,
      pathname,
      router,
      setShowCreateGoalModal,
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
      <StatusBar animated style={currentTheme === 'dark' ? 'light' : 'dark'} />

      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <RootStackScreens
            screenBackgroundColor={surfaces.screen.backgroundColor}
          />
        </View>

        {showBottomNav ? (
          <AppBottomTabBar onCreate={handleCreate} pathname={pathname} />
        ) : null}
      </View>

      {isAuthenticated ? (
        <GlobalOverlays
          profile={profile}
          showSharedCelebrations={showSharedCelebrations}
        />
      ) : null}
      <AppToast />
    </>
  )
}

function GlobalOverlays({
  profile,
  showSharedCelebrations,
}: Readonly<{
  profile: ReturnType<typeof useProfile>['profile']
  showSharedCelebrations: boolean
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
  const hasCompletedOnboarding = profile?.hasCompletedOnboarding ?? false
  const pendingOnboardingAnswers = useOnboardingDraftStore((s) =>
    s.hasPendingAnswers(),
  )
  const liveOnboardingActions = useLiveOnboardingActions()

  useEffect(() => {
    if (gamification.leveledUp && gamification.newLevel) {
      armReferralPrompt(getReferralLevelMilestone(gamification.newLevel))
      if (
        isReviewMomentEligible(
          useReviewReminderStore.getState(),
          hasCompletedOnboarding,
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
    hasCompletedOnboarding,
  ])

  useEffect(() => {
    const crossedStreak = gamification.crossedStreakMilestones.at(-1) ?? null
    const shareableAchievement = gamification.newAchievements.find(
      isShareableAchievement,
    )
    const candidateKey =
      crossedStreak !== null
        ? getMilestoneShareStreakKey(crossedStreak)
        : shareableAchievement
          ? getMilestoneShareAchievementKey(shareableAchievement.id)
          : null
    if (candidateKey) {
      armMilestoneSharePrompt(candidateKey)
    }
  }, [
    gamification.crossedStreakMilestones,
    gamification.newAchievements,
    armMilestoneSharePrompt,
  ])

  return (
    <>
      <ExpiryWarning />
      <TrialExpiredModal />
      {profile && !profile.hasCompletedOnboarding && !pendingOnboardingAnswers ? (
        <OnboardingActionsProvider
          actions={liveOnboardingActions}
          hasProAccess={hasProAccess}
          isLive
        >
          <OnboardingFlow />
        </OnboardingActionsProvider>
      ) : null}
      <Suspense fallback={null}>
        {profile?.hasCompletedOnboarding ? <PushPrompt /> : null}
      </Suspense>
      {profile?.hasCompletedOnboarding ? (
        <>
          {showSharedCelebrations ? <StreakCelebration /> : null}
          {showSharedCelebrations ? <AllDoneCelebration /> : null}
          <GoalCompletedCelebration />
          {showSharedCelebrations ? <WelcomeBackToast /> : null}
          {showSharedCelebrations && hasProAccess ? <AchievementToast /> : null}
          {showSharedCelebrations && canViewGamification ? (
            <LevelUpOverlay
              leveledUp={gamification.leveledUp}
              newLevel={gamification.newLevel}
              onClear={gamification.clearLevelUp}
            />
          ) : null}
          <ReferralPrompt />
          <MilestoneSharePrompt />
          <ReviewMomentSheet />
        </>
      ) : null}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <CalendarImportPrompt />
      <AstraImportPrompt />
      <VersionUpdateDrawer />
      <TourProvider>
        <TourOverlay />
      </TourProvider>
    </>
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
function AppBottomTabBar({
  onCreate,
  pathname,
}: Readonly<{ onCreate: () => void; pathname: string }>) {
  const router = useRouter()
  const setActiveView = useUIStore((s) => s.setActiveView)
  const fabRef = useRef<View>(null)
  useTourTarget('tour-fab-button', fabRef)
  const insets = useSafeAreaInsets()

  const active: BottomTabId = useMemo(() => {
    if (pathname === '/' || pathname === '/today') return 'today'
    if (pathname.startsWith('/chat')) return 'chat'
    if (pathname === '/calendar' || pathname.startsWith('/calendar/')) return 'calendar'
    return 'profile'
  }, [pathname])

  const handleTab = (id: BottomTabId) => {
    if (id === 'today') {
      setActiveView('today')
      router.navigate('/')
      return
    }
    if (id === 'chat') router.navigate('/chat')
    else if (id === 'calendar') router.navigate('/calendar')
    else if (id === 'profile') router.navigate('/profile')
  }

  return (
    <View
      style={[
        bottomTabStyles.container,
        { paddingBottom: insets.bottom },
      ]}
    >
      <View ref={fabRef} collapsable={false}>
        <BottomTabBar
          active={active}
          onTab={handleTab}
          onFab={onCreate}
        />
      </View>
    </View>
  )
}

const bottomTabStyles = StyleSheet.create({
  container: {
    width: '100%',
  },
})

const styles = StyleSheet.create({
  shellRoot: {
    flex: 1,
    overflow: 'hidden',
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
