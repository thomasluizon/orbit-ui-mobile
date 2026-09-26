import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth-store'

export async function reconcileSessionOnForeground(): Promise<void> {
  const wasAuthenticated = useAuthStore.getState().isAuthenticated
  await useAuthStore.getState().checkAuth()
  if (wasAuthenticated && !useAuthStore.getState().isAuthenticated) {
    router.replace('/login')
  }
}
