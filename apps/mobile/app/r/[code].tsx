import { useEffect } from 'react'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { isValidReferralCode } from '@/lib/auth-flow'

export default function ReferralRedirectScreen() {
  const params = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()

  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : undefined
    const href = code && isValidReferralCode(code)
      ? `/login?ref=${encodeURIComponent(code)}`
      : '/login'

    router.replace(href as Href)
  }, [params.code, router])

  return null
}
