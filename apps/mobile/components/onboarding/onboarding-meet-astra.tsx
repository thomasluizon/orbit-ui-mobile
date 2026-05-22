import { useEffect, useMemo } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** v8 onboarding step 2: rotating orbit ring + Sparkles icon, italic Astra prose. */
export function OnboardingMeetAstra() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  const rotation = useMemo(() => new Animated.Value(0), [])
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 3600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    spin.start()
    return () => {
      spin.stop()
    }
  }, [rotation])

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: tokens.primary,
              transform: [{ rotate: spin }],
            },
          ]}
        />
        <Sparkles size={32} strokeWidth={1.4} color={tokens.fg1} />
      </View>

      <Text style={[styles.title, { color: tokens.fg1 }]}>
        {t('onboarding.flow.meetAstra.title')}
      </Text>

      <Text style={[styles.subtitle, { color: tokens.fg2 }]}>
        {t('onboarding.flow.meetAstra.subtitle')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 22,
    paddingTop: 32,
    paddingBottom: 8,
  },
  iconWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  title: {
    fontFamily: 'Geist',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.48,
    lineHeight: 28,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Geist',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
})
