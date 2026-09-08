import { useEffect, useMemo } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: the pinned Reanimated ABI cannot move until https://github.com/thomasluizon/orbit-ui-mobile/issues/243.
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { X } from '@/components/ui/icons'
import { createTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

const STREAK_MILESTONES = new Set([7, 14, 30, 90, 100, 365])

function getCelebrationCopy(
  active: NonNullable<ReturnType<typeof useUIStore.getState>['activeCelebration']>,
): { key: string; values: Record<string, string | number> } {
  switch (active.kind) {
    case 'streak': return { key: 'streak', values: { count: active.payload.streak } }
    case 'goal-completed': return { key: 'goal', values: { name: active.payload.name, count: active.payload.count } }
    case 'level-up': return { key: 'level', values: { level: active.payload.level } }
    case 'all-done': return { key: 'day', values: { count: active.payload.count } }
  }
}

export function CelebrationPanel() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const rise = useMemo(() => new Animated.Value(reducedMotion ? 1 : 0), [reducedMotion])
  const sweep = useMemo(() => new Animated.Value(reducedMotion ? 1 : 0), [reducedMotion])
  const active = useUIStore((state) => state.activeCelebration)
  const complete = useUIStore((state) => state.completeActiveCelebration)

  useEffect(() => {
    if (!active || reducedMotion) return
    rise.setValue(0)
    sweep.setValue(0)
    const timing = {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }
    const entrance = Animated.parallel([
      Animated.timing(rise, timing),
      Animated.timing(sweep, timing),
    ])
    entrance.start()
    return () => entrance.stop()
  }, [active, reducedMotion, rise, sweep])

  if (!active) return null
  if (active.kind === 'streak' && !STREAK_MILESTONES.has(active.payload.streak)) return null

  const { key, values } = getCelebrationCopy(active)

  function dismiss() {
    complete(active?.id)
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      testID="celebration-panel"
      style={[
        styles.panel,
        { backgroundColor: tokens.bgElev, borderColor: tokens.hairline },
        { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
    >
      <View testID="celebration-ring" style={styles.ring}>
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.statusEmpty} strokeWidth={2} />
          <Circle cx={22} cy={22} r={18} fill="none" stroke={tokens.fg1} strokeWidth={3} strokeLinecap="round" />
        </Svg>
        {reducedMotion ? null : (
          <Animated.View
            testID="celebration-ring-travel"
            style={[
              styles.travelRing,
              { borderColor: tokens.primary },
              {
                transform: [
                  { rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                  { scale: sweep.interpolate({ inputRange: [0, 0.99, 1], outputRange: [1, 1, 0] }) },
                ],
              },
            ]}
          />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>{t(`celebration.${key}.eyebrow`)}</Text>
        <Text style={[styles.line, { color: tokens.fg1 }]}>{t(`celebration.${key}.line`, values)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('celebration.close')} hitSlop={8} onPress={dismiss} style={styles.close}>
        <X aria-hidden size={20} color={tokens.fg2} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    marginHorizontal: 16,
    padding: 24,
  },
  ring: { height: 44, width: 44 },
  travelRing: {
    borderRadius: 22,
    borderRightColor: 'transparent',
    borderWidth: 3,
    height: 42,
    left: 1,
    position: 'absolute',
    top: 1,
    width: 42,
  },
  copy: { flex: 1, gap: 4 },
  eyebrow: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  line: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 23 },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
})
