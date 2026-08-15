import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { isValidReferralCode } from '@/lib/auth-flow'
import { useAuthStore } from '@/stores/auth-store'

export default function ReferralRedirectScreen() {
  const params = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : undefined
    const validCode = code && isValidReferralCode(code) ? code : undefined

    if (isAuthenticated) {
      router.replace('/')
      return
    }

    const href = validCode ? `/login?ref=${encodeURIComponent(validCode)}` : '/login'
    router.replace(href)
  }, [params.code, router, isAuthenticated])

  return null
}
