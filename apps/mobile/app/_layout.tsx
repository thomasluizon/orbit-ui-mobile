import { useEffect, lazy, Suspense, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { Providers } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { TrialBanner } from '@/components/ui/trial-banner'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useHasProAccess } from '@/hooks/use-profile'
import { useTotalHabitCount } from '@/hooks/use-habits'
import { syncWidgetTheme } from '@/lib/orbit-widget'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

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

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'auth-callback'

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login')
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, segments, router])

  return null
}

function RootLayoutNav() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const segments = useSegments()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const totalHabitCount = useTotalHabitCount()
  const { leveledUp, newLevel } = useGamificationProfile()
  const { colors, currentTheme } = useAppTheme()
  const activeView = useUIStore((s) => s.activeView)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
  const [levelUpCleared, setLevelUpCleared] = useState(false)
  const streakFreezeRef = useRef<StreakFreezeCelebrationHandle>(null)

  const topSegment = segments[0]
  const showAppShellBanner = useMemo(
    () =>
      isAuthenticated &&
      topSegment !== 'login' &&
      topSegment !== 'auth-callback' &&
      topSegment !== 'chat' &&
      topSegment !== 'privacy' &&
      topSegment !== 'r',
    [isAuthenticated, topSegment],
  )

  const showBottomNav = useMemo(
    () =>
      isAuthenticated &&
      topSegment !== 'login' &&
      topSegment !== 'auth-callback' &&
      topSegment !== 'chat' &&
      topSegment !== 'privacy' &&
      topSegment !== 'r',
    [isAuthenticated, topSegment],
  )

  const handleCreate = useMemo(
    () => () => {
      if (activeView === 'goals') {
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
    setLevelUpCleared(false)
  }, [newLevel])

  useEffect(() => {
    if (!isAuthenticated) return
    syncWidgetTheme(profile?.colorScheme ?? 'purple', currentTheme).catch(() => {})
  }, [currentTheme, isAuthenticated, profile?.colorScheme])

  return (
    <>
      <AuthGuard />
      <StatusBar animated style={currentTheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {showAppShellBanner ? (
          <View style={{ paddingHorizontal: 20, backgroundColor: colors.background }}>
            <TrialBanner />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="chat"
              options={{ animation: 'slide_from_right' }}
            />
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
        </View>

        {showBottomNav ? <BottomNav onCreate={handleCreate} /> : null}
      </View>
      {isAuthenticated && profile && !profile.hasCompletedOnboarding && (
        <OnboardingFlow />
      )}
      {isAuthenticated && profile?.hasCompletedOnboarding && (
        <Suspense fallback={null}>
          <PushPrompt />
        </Suspense>
      )}
      {isAuthenticated ? (
        <>
          <TrialExpiredModal />
          <StreakCelebration />
          <AllDoneCelebration />
          <GoalCompletedCelebration />
          {profile?.hasProAccess ? <AchievementToast /> : null}
          <WelcomeBackToast />
          {profile?.hasProAccess ? (
            <LevelUpOverlay
              leveledUp={leveledUp && !levelUpCleared}
              newLevel={newLevel}
              onClear={() => setLevelUpCleared(true)}
            />
          ) : null}
          <StreakFreezeCelebration ref={streakFreezeRef} />
          <CalendarImportPrompt />
        </>
      ) : null}
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
