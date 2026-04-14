import { useEffect, lazy, Suspense, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { Providers } from '@/lib/providers'
import { usePendingGoogleAuthSession } from '@/lib/google-auth-callback'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useAdMob } from '@/hooks/use-ad-mob'
import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { useAppTheme } from '@/lib/use-app-theme'
import { syncWidgetTheme } from '@/lib/orbit-widget'
import { useUIStore } from '@/stores/ui-store'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { AppToast } from '@/components/ui/app-toast'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'

// Push notifications are not supported in Expo Go (removed in SDK 53).
// Only import PushPrompt in dev builds / standalone.
const isExpoGo = Constants.appOwnership === 'expo'
const PushPrompt = isExpoGo
  ? () => null
  : lazy(() => import('@/components/ui/push-prompt').then((m) => ({ default: m.PushPrompt })))

function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const {
    callbackUrl: pendingGoogleAuthCallbackUrl,
    isPending: isPendingGoogleAuthSession,
  } = usePendingGoogleAuthSession()
  const segments = useSegments()
  const router = useRouter()
  const firstSegment = segments[0] as string | undefined

  useEffect(() => {
    if (isLoading) return

    const inPublicRoute =
      firstSegment === 'login' ||
      firstSegment === 'auth-callback' ||
      firstSegment === 'r' ||
      firstSegment === 'privacy'
    const allowAuthCallbackWhileResolving =
      firstSegment === 'auth-callback' &&
      (isPendingGoogleAuthSession || Boolean(pendingGoogleAuthCallbackUrl))

    if (!isAuthenticated && !inPublicRoute) {
      router.replace('/login')
    } else if (isAuthenticated && firstSegment === 'login') {
      router.replace('/')
    } else if (
      isAuthenticated &&
      firstSegment === 'auth-callback' &&
      !allowAuthCallbackWhileResolving
    ) {
      router.replace('/')
    }
  }, [
    firstSegment,
    isAuthenticated,
    isLoading,
    isPendingGoogleAuthSession,
    pendingGoogleAuthCallbackUrl,
    router,
  ])

  return null
}

function RootLayoutNav() {
  const router = useRouter()
  const pathname = usePathname()
  const segments = useSegments()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { profile } = useProfile()
  const { initialize: initializeAdMob } = useAdMob()
  useTimezoneAutoSync(profile)
  const hasProAccess = useHasProAccess()
  const totalHabitCount = useTotalHabitCount()
  const { colors, currentTheme, currentScheme } = useAppTheme()
  const activeView = useUIStore((s) => s.activeView)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)

  const topSegment = segments[0] as string | undefined
  const hideAppShellChrome =
    topSegment === 'login' ||
    topSegment === 'auth-callback' ||
    topSegment === 'chat' ||
    topSegment === 'privacy' ||
    topSegment === 'r'

  const showBottomNav = isAuthenticated && !hideAppShellChrome
  const showSharedCelebrations = pathname !== '/'

  const handleCreate = useMemo(
    () => () => {
      if (activeView === 'goals') {
        if (!hasProAccess) {
          router.push('/upgrade')
          return
        }
        setShowCreateGoalModal(true)
        return
      }

      if (!hasProAccess && totalHabitCount >= 10) {
        router.push('/upgrade')
        return
      }

      setShowCreateModal(true)
    },
    [
      activeView,
      hasProAccess,
      router,
      setShowCreateGoalModal,
      setShowCreateModal,
      totalHabitCount,
    ],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    syncWidgetTheme(currentScheme, currentTheme).catch(() => {})
  }, [currentScheme, currentTheme, isAuthenticated])

  useEffect(() => {
    void initializeAdMob()
  }, [initializeAdMob])

  return (
    <>
      <AuthGuard />
      <StatusBar animated style={currentTheme === 'dark' ? 'light' : 'dark'} />

      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen name="auth-callback" options={{ gestureEnabled: false }} />
            <Stack.Screen name="preferences" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="ai-settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="advanced" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="support" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="achievements" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="streak" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="upgrade" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="retrospective" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="calendar-sync" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </View>

        {showBottomNav ? <BottomNav onCreate={handleCreate} /> : null}
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
  const gamification = useGamificationProfile(hasProAccess)

  return (
    <>
      <TrialExpiredModal />
      {profile && !profile.hasCompletedOnboarding ? <OnboardingFlow /> : null}
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
          {showSharedCelebrations && hasProAccess ? (
            <LevelUpOverlay
              leveledUp={gamification.leveledUp}
              newLevel={gamification.newLevel}
              onClear={gamification.clearLevelUp}
            />
          ) : null}
        </>
      ) : null}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <CalendarImportPrompt />
      <VersionUpdateDrawer />
      <TourProvider>
        <TourOverlay />
      </TourProvider>
    </>
  )
}

function RootLayoutContent() {
  const { colors } = useAppTheme()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RootLayoutNav />
    </View>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <RootLayoutContent />
      </Providers>
    </GestureHandlerRootView>
  )
}
