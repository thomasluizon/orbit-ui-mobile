import { useEffect, useMemo } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: retain the celebration adapter while https://github.com/thomasluizon/orbit-ui-mobile/issues/243 pins the animation ABI.
  Animated,
  Pressable, StyleSheet, Text, View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { DAILY_STREAK_MOMENT_DURATION } from '@orbit/shared/stores'
import { motionDurations, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { X } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useUIStore } from '@/stores/ui-store'
import { plural } from '@/lib/plural'

export function DailyStreakMoment({ streak, reducedMotion, onDismiss, id }: {
  id: string
  streak: number
  reducedMotion: boolean
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const progress = useMemo(() => new Animated.Value(reducedMotion ? 1 : 0), [reducedMotion])
  useEffect(() => {
    const timeout = setTimeout(() => useUIStore.getState().completeActiveCelebration(id), DAILY_STREAK_MOMENT_DURATION)
    return () => clearTimeout(timeout)
  }, [id])
  useEffect(() => {
    if (reducedMotion) return
    const animation = Animated.timing(progress, {
      toValue: 1, duration: motionDurations.slow,
      easing: toAnimatedEasing(easings.out), useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [progress, reducedMotion])

  return (
    <View testID="daily-streak-moment" data-motion={reducedMotion ? 'static' : 'animated'} accessibilityLiveRegion="polite" style={[styles.panel, { backgroundColor: tokens.bgElev, borderColor: tokens.hairline }]}>
      <View style={styles.ring} importantForAccessibility="no-hide-descendants">
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.statusEmpty} strokeWidth={2} />
          <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.fg1} strokeWidth={3} />
        </Svg>
        {reducedMotion ? null : <Animated.View style={[styles.travelRing, { borderColor: tokens.fg1, transform: [
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.99, 1], outputRange: [1, 1, 0] }) },
        ] }]} />}
      </View>
      <View style={styles.copy} accessible accessibilityLabel={plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('celebration.streak.eyebrow')}</Text>
        <View style={styles.numberClip}>
          {reducedMotion ? null : <Animated.Text testID="daily-streak-previous" style={[styles.number, styles.previous, { color: tokens.fg1, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }]}>{streak - 1}</Animated.Text>}
          <Animated.Text testID="daily-streak-number" style={[styles.number, { color: tokens.fg1 }, reducedMotion ? undefined : { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{streak}</Animated.Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('celebration.close')} onPress={onDismiss} style={styles.close}>
        <X aria-hidden size={20} color={tokens.fg2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 16 },
  ring: { height: 44, width: 44 },
  travelRing: { borderRadius: 22, borderRightColor: 'transparent', borderWidth: 3, height: 42, left: 1, position: 'absolute', top: 1, width: 42 },
  copy: { flex: 1, minWidth: 0 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  numberClip: { overflow: 'hidden' },
  number: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 24, lineHeight: 28.8, fontVariant: ['tabular-nums'] },
  previous: { position: 'absolute', left: 0, top: 0 },
  close: { alignItems: 'center', height: TOUCH_TARGET_MIN, justifyContent: 'center', width: TOUCH_TARGET_MIN },
})
