import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Providers } from '@/lib/providers'
import { useAuthStore } from '@/stores/auth-store'

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
  return (
    <>
      <AuthGuard />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
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
    </>
  )
}

export default function RootLayout() {
  return (
    <Providers>
      <RootLayoutNav />
    </Providers>
  )
}
