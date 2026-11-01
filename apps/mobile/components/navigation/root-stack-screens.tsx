import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'
import { useGoogleErrorLogin } from '@/lib/google-auth-callback'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { mobileMotion, usePrefersReducedMotion } from '@/lib/motion'
import { captureBuildEnabled, shouldExposeOnboardingRoute } from '@/lib/capture-mode'

const SLIDE_FROM_RIGHT_SCREENS = [
  'support',
  'wrapped',
] as const

export function RootStackScreens({
  screenBackgroundColor,
}: Readonly<{ screenBackgroundColor: string }>) {
  const reducedMotion = usePrefersReducedMotion()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const allowErrorLogin = useGoogleErrorLogin()
  const onboardingLocallyDone = useOnboardingDraftStore(
    (s) => s.onboardingLocallyDone,
  )

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: captureBuildEnabled || reducedMotion ? 'none' : 'slide_from_right',
        animationDuration: captureBuildEnabled || reducedMotion
          ? 0
          : mobileMotion.presets['route-push'].enterDuration,
        animationMatchesGesture: true,
        gestureEnabled: !reducedMotion,
        animationTypeForReplace: 'push',
        contentStyle: { backgroundColor: screenBackgroundColor },
      }}
    >
      <Stack.Protected
        redirectTo={isAuthenticated ? '/(tabs)' : '/login'}
        guard={shouldExposeOnboardingRoute(
          captureBuildEnabled,
          isAuthenticated,
          onboardingLocallyDone,
        )}
      >
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated || allowErrorLogin} redirectTo="/(tabs)">
        <Stack.Screen
          name="login"
          options={{
            animation: captureBuildEnabled || reducedMotion ? 'none' : 'fade',
            gestureEnabled: false,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated} redirectTo="/login">
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="progress/streak" />
        <Stack.Screen name="progress/goals" />
        <Stack.Screen name="progress/achievements" />
        <Stack.Screen name="profile/account" />
        <Stack.Screen name="profile/preferences" />
        <Stack.Screen name="profile/astra" />
        <Stack.Screen name="auth-callback/notion" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="profile/notifications" />
        <Stack.Screen name="habits/new" />
        <Stack.Screen name="upgrade" options={{ animation: captureBuildEnabled || reducedMotion ? 'none' : 'slide_from_bottom' }} />
        <Stack.Screen name="step-up" options={{ animation: captureBuildEnabled || reducedMotion ? 'none' : 'slide_from_bottom' }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="notifications" />
        <Stack.Screen
          name="chat"
          options={{
            animation: captureBuildEnabled || reducedMotion ? 'none' : 'slide_from_right',
          }}
        />
        {SLIDE_FROM_RIGHT_SCREENS.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              animation: captureBuildEnabled || reducedMotion ? 'none' : 'slide_from_right',
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
        options={{ animation: captureBuildEnabled || reducedMotion ? 'none' : 'fade' }}
      />
      <Stack.Screen
        name="terms"
        options={{ animation: captureBuildEnabled || reducedMotion ? 'none' : 'fade' }}
      />
      <Stack.Screen name="r/[code]" />
      <Stack.Screen name="about" />
      <Stack.Screen
        name="auth-callback"
        options={{
          animation: captureBuildEnabled || reducedMotion ? 'none' : 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  )
}
