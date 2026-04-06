import { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function ProBadge() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { colors } = useAppTheme()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shimmerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!isTrialActive && !hasProAccess) return

    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [isTrialActive, hasProAccess, shimmerAnim])

  if (!isTrialActive && !hasProAccess) return null

  const badgeLabel = isTrialActive
    ? t('trial.proBadge')
    : t('common.proBadge')

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.4, 0.6, 1],
    outputRange: [1, 0.7, 1, 1],
  })

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: colors.primary_15,
          opacity,
        },
      ]}
    >
      <Text style={[styles.text, { color: colors.primary }]}>{badgeLabel}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
})

