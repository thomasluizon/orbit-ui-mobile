import { useLayoutEffect, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: retain the celebration adapter while https://github.com/thomasluizon/orbit-ui-mobile/issues/243 pins the animation ABI.
  Animated,
  StyleSheet, Text, View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { toAnimatedEasing } from '@/lib/motion'
import { plural } from '@/lib/plural'

export function DailyStreakMoment({ streak, entering }: { streak: number; entering: boolean }) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [progress] = useState(() => new Animated.Value(1))
  const format = new Intl.NumberFormat(i18n.language)
  const previous = format.format(streak - 1)
  const current = format.format(streak)
  useLayoutEffect(() => {
    progress.stopAnimation()
    if (!entering) { progress.setValue(1); return }
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: motionDurations.slow,
      easing: toAnimatedEasing(motionEasings.enter), useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [entering, progress])
  return (
    <View style={styles.copy} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.label, { color: tokens.fg2 }]}>{t('celebration.streak.eyebrow')}</Text>
      <View style={styles.figure}>
        <View style={styles.numberClip}>
          <Text style={[styles.number, styles.reservation]}>{previous.length > current.length ? previous : current}</Text>
          {entering ? <Animated.Text testID="daily-streak-previous" style={[styles.number, styles.fragment, { color: tokens.fg1,
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }]}>{previous}</Animated.Text> : null}
          <Animated.Text testID="daily-streak-number" style={[styles.number, styles.fragment, { color: tokens.fg1 }, entering ? {
            opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] } : undefined]}>{current}</Animated.Text>
        </View>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{plural(t('celebration.streak.unit', { count: streak }), streak)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  copy: { minWidth: 0 },
  figure: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 },
  numberClip: { overflow: 'hidden' },
  number: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33.6, fontVariant: ['tabular-nums'] },
  fragment: { position: 'absolute', left: 0, top: 0 },
  reservation: { opacity: 0 },
})
