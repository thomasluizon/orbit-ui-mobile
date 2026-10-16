import { useEffect, useMemo, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: retain the celebration adapter while https://github.com/thomasluizon/orbit-ui-mobile/issues/243 pins the animation ABI.
  Animated,
  StyleSheet, Text, View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { DAILY_STREAK_MOMENT_DURATION } from '@orbit/shared/stores'
import { motionDurations, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Button } from '@/components/ui/pill-button'
import { X } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useUIStore } from '@/stores/ui-store'
import { plural } from '@/lib/plural'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const DAY_RING_LENGTH = 2 * Math.PI * 18

export function DailyStreakMoment({ streak, reducedMotion, onDismiss, id }: {
  id: string
  streak: number
  reducedMotion: boolean
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focused, setFocused] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const label = plural(t('streakDisplay.badge.tooltip', { count: streak }), streak)
  useEffect(() => {
    const timeout = setTimeout(() => setAnnouncement(label), 0)
    return () => clearTimeout(timeout)
  }, [label])
  const progress = useMemo(() => new Animated.Value(reducedMotion ? 1 : 0), [reducedMotion])
  useEffect(() => {
    if (focused) return
    const timeout = setTimeout(() => useUIStore.getState().completeActiveCelebration(id), DAILY_STREAK_MOMENT_DURATION)
    return () => clearTimeout(timeout)
  }, [id, focused])
  useEffect(() => {
    if (reducedMotion) return
    const animation = Animated.timing(progress, {
      toValue: 1, duration: motionDurations.slow,
      easing: toAnimatedEasing(easings.out), useNativeDriver: false,
    })
    animation.start()
    return () => animation.stop()
  }, [progress, reducedMotion])

  return (
    <View testID="daily-streak-moment" data-motion={reducedMotion ? 'static' : 'animated'} style={[styles.panel, { backgroundColor: tokens.bgElev, borderColor: tokens.hairline }]}>
      <Text testID="daily-streak-announcement" accessibilityLiveRegion="polite" style={[styles.announcement, { color: tokens.fg1 }]}>{announcement}</Text>
      <View style={styles.ring} importantForAccessibility="no-hide-descendants">
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.statusEmpty} strokeWidth={2} />
          <AnimatedCircle cx={22} cy={22} r={18} fill="none" stroke={tokens.fg1} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${DAY_RING_LENGTH}`} strokeDashoffset={reducedMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [DAY_RING_LENGTH, 0] })} rotation={-90} origin="22, 22" />
        </Svg>
      </View>
      <View style={styles.copy} accessible accessibilityLabel={label}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t('celebration.streak.eyebrow')}</Text>
        <View style={styles.numberClip}>
          {reducedMotion ? null : <Animated.Text testID="daily-streak-previous" style={[styles.number, styles.previous, { color: tokens.fg1, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }]}>{streak - 1}</Animated.Text>}
          <Animated.Text testID="daily-streak-number" style={[styles.number, { color: tokens.fg1 }, reducedMotion ? undefined : { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{streak}</Animated.Text>
        </View>
      </View>
      <Button variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN} label={t('celebration.close')} onClick={onDismiss} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <X aria-hidden size={20} color={tokens.fg2} />
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', fontFamily: 'Geist_400Regular', fontSize: 14 },
  ring: { height: 44, width: 44 },
  copy: { flex: 1, minWidth: 0 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 },
  numberClip: { overflow: 'hidden' },
  number: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33.6, fontVariant: ['tabular-nums'] },
  previous: { position: 'absolute', left: 0, top: 0 },
})
