import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { useGoogleErrorLogin } from '@/lib/google-auth-callback'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { mobileMotion } from '@/lib/motion'

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
] as const

export function RootStackScreens({
  screenBackgroundColor,
}: Readonly<{ screenBackgroundColor: string }>) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const allowErrorLogin = useGoogleErrorLogin()
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
      <Stack.Protected guard={!isAuthenticated && !onboardingLocallyDone}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated || allowErrorLogin}>
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

      {/* Public, unguarded screens MUST stay declared LAST: Expo Router anchors the
          stack to the first AVAILABLE screen, so after login flips the guards the
          user lands on (tabs), not /privacy. Regression from #400; fix #431.
          https://docs.expo.dev/router/advanced/protected/ */}
      <Stack.Screen name="privacy" options={{ animation: 'fade' }} />
      <Stack.Screen name="terms" options={{ animation: 'fade' }} />
      <Stack.Screen name="r" />
      <Stack.Screen
        name="auth-callback"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
    </Stack>
  )
}

