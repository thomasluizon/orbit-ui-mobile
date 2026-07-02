import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { isValidReferralCode } from '@/lib/auth-flow'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export default function ReferralRedirectScreen() {
  const params = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : undefined
    const href = code && isValidReferralCode(code)
      ? `/login?ref=${encodeURIComponent(code)}`
      : '/login'

    router.replace(href as Href)
  }, [params.code, router])

  return <View style={{ flex: 1, backgroundColor: tokens.bg }} />
}
