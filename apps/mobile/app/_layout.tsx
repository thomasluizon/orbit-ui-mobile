import { useEffect, lazy, Suspense } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { Providers } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'
import { useProfile } from '@/hooks/use-profile'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { syncWidgetTheme } from '@/lib/orbit-widget'
import { useAppTheme } from '@/lib/use-app-theme'

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
      router.replace('/(tabs)')
    }
  }, [isAuthenticated, isLoading, segments, router])

  return null
}

function RootLayoutNav() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { profile } = useProfile()
  const { colors } = useAppTheme()

  useEffect(() => {
    if (!isAuthenticated) return
    syncWidgetTheme(profile?.colorScheme ?? 'purple', 'dark').catch(() => {})
  }, [isAuthenticated, profile?.colorScheme])

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
      {isAuthenticated && profile && !profile.hasCompletedOnboarding && (
        <OnboardingFlow />
      )}
      {isAuthenticated && profile?.hasCompletedOnboarding && (
        <Suspense fallback={null}>
          <PushPrompt />
        </Suspense>
      )}
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
