import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Signs the user out and routes to the login screen.
 *
 * Navigation lives here (the component layer), not inside the auth store's
 * `logout`: an imperative navigation during store teardown caused a grey-screen
 * crash (#170), so `logout` stays navigation-free. Guard-based routing alone
 * cannot tell a signed-out user from a first-run user (both are unauthenticated
 * with an empty onboarding draft), so the router anchor would otherwise drop the
 * user on the onboarding flow (#431 / #432).
 */
export function useLogout(): () => Promise<void> {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  return useCallback(async () => {
    await logout()
    router.replace('/login')
  }, [logout, router])
}
