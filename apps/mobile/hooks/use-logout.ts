import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

export function useLogout(): () => Promise<void> {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  return useCallback(async () => {
    const didLogout = await logout()
    if (didLogout) {
      router.replace('/login')
    }
  }, [logout, router])
}
