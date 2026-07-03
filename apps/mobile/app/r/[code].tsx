import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { isValidReferralCode } from '@/lib/auth-flow'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAuthStore } from '@/stores/auth-store'

export default function ReferralRedirectScreen() {
  const params = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : undefined
    const validCode = code && isValidReferralCode(code) ? code : undefined

    if (isAuthenticated) {
      if (validCode) {
        router.replace({ pathname: '/social', params: { invite: validCode } })
      } else {
        router.replace('/social')
      }
      return
    }

    const href = validCode ? `/login?ref=${encodeURIComponent(validCode)}` : '/login'
    router.replace(href as Href)
  }, [params.code, router, isAuthenticated])

  return <View style={{ flex: 1, backgroundColor: tokens.bg }} />
}
