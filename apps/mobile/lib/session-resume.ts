import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Re-validates the session when the app returns to the foreground and routes to
 * the login screen if it was cleared (an expired or revoked refresh token).
 *
 * The navigation lives here, not in the auth store, so store teardown stays
 * render-safe: a store-level nav during teardown caused a grey-screen crash
 * (#170). Without an explicit redirect the router anchor would drop the
 * signed-out user on the onboarding flow instead of /login (#431 / #432).
 */
export async function reconcileSessionOnForeground(): Promise<void> {
  const wasAuthenticated = useAuthStore.getState().isAuthenticated
  await useAuthStore.getState().checkAuth()
  if (wasAuthenticated && !useAuthStore.getState().isAuthenticated) {
    router.replace('/login')
  }
}
