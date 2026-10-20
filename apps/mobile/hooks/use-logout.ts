import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'

/**
 * Signs the user out and routes to the login screen. Navigation lives here (the component
 * layer), not inside the auth store's `logout`: an imperative navigation during store
 * teardown caused a grey-screen crash (#170), so `logout` stays navigation-free.
 */
export function useLogout(): (observedCredential?: ReturnType<typeof getSessionGeneration>) => Promise<void> {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  return useCallback(async (observedCredential) => {
    const didLogout = await logout(observedCredential)
    if (didLogout) {
      router.replace('/login')
    }
  }, [logout, router])
}
