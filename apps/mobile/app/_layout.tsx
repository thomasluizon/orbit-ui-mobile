import { useEffect, lazy, Suspense, useRef } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { Providers } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useProfile } from '@/hooks/use-profile'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakFreezeCelebration } from '@/components/gamification/streak-freeze-celebration'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { colors } from '@/lib/theme'

// Push notifications are not supported in Expo Go (removed in SDK 53).
// Only import PushPrompt in dev builds / standalone.
const isExpoGo = Constants.executionEnvironment === 'storeClient'
const PushPrompt = isExpoGo
  ? () => null
  : lazy(() => import('@/components/ui/push-prompt').then(m => ({ default: m.PushPrompt })))

function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
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

    if (!isAuthenticated && !inPublicRoute) {
      router.replace('/login')
    } else if (isAuthenticated && (firstSegment === 'login' || firstSegment === 'auth-callback')) {
      router.replace('/(tabs)')
    }
  }, [firstSegment, isAuthenticated, isLoading, router])

  return null
}

function RootLayoutNav() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { profile } = useProfile()
  const pathname = usePathname()
  const showSharedCelebrations = pathname !== '/'

  return (
    <>
      <AuthGuard />
      <StatusBar style="light" />
      <ExpiryWarning />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="login"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="auth-callback"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="preferences"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ai-settings"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="advanced"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="about"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="support"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="achievements"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="streak"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="upgrade"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="retrospective"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="calendar-sync"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="privacy"
          options={{ animation: 'slide_from_right' }}
        />
      </Stack>
      {isAuthenticated && (
        <GlobalOverlays
          profile={profile}
          showSharedCelebrations={showSharedCelebrations}
        />
      )}
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
  const gamification = useGamificationProfile()
  const streakFreezeRef = useRef<{ show: () => void }>(null)
  const hasProAccess = profile?.hasProAccess ?? false

  return (
    <>
      <TrialExpiredModal />
      {profile && !profile.hasCompletedOnboarding && <OnboardingFlow />}
      {profile?.hasCompletedOnboarding && (
        <Suspense fallback={null}>
          <PushPrompt />
        </Suspense>
      )}
      {showSharedCelebrations && <StreakCelebration />}
      {showSharedCelebrations && <AllDoneCelebration />}
      <GoalCompletedCelebration />
      {showSharedCelebrations && <WelcomeBackToast />}
      {showSharedCelebrations && hasProAccess && <AchievementToast />}
      {showSharedCelebrations && hasProAccess && (
        <LevelUpOverlay
          leveledUp={gamification.leveledUp}
          newLevel={gamification.newLevel}
          onClear={gamification.clearLevelUp}
        />
      )}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      <CalendarImportPrompt />
    </>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <RootLayoutNav />
        </View>
      </Providers>
    </GestureHandlerRootView>
  )
}
