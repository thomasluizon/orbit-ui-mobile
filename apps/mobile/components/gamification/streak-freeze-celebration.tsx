import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useCallback,
} from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings, zLayers } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import { rgbaFromHex } from '@/app/streak-sections-styles'
import { useCelebrationEntrance } from './celebration-motion'
import { RingMotif } from './ring-motif'

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

/**
 * Streak-freeze celebration: dashed frozen rings around an emoji hero disc
 * with the held streak as a big Inter numeral.
 * Preserves the imperative `show()` API used by callers.
 */
export const StreakFreezeCelebration = forwardRef<StreakFreezeCelebrationHandle>(
  function StreakFreezeCelebration(_props, ref) {
    const { t } = useTranslation()
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(
      () => createTokensV2(currentScheme, currentTheme),
      [currentScheme, currentTheme],
    )
    const { profile } = useProfile()
    const { displayDate } = useDateFormat()

    const overlayOpacity = useMemo(() => new Animated.Value(0), [])
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const isShowingRef = useRef(false)
    const [celebrationActive, setCelebrationActive] = useState(false)
    const { orbStyle, titleStyle, subtitleStyle } =
      useCelebrationEntrance(celebrationActive)

    const dismiss = useCallback(() => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start(() => {
        isShowingRef.current = false
        setCelebrationActive(false)
      })
    }, [overlayOpacity])

    function show() {
      if (isShowingRef.current) return
      isShowingRef.current = true
      setCelebrationActive(true)

      overlayOpacity.setValue(0)
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start()

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(dismiss, 3000)
    }

    useImperativeHandle(ref, () => ({ show }))

    useEffect(() => {
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      }
    }, [])

    const streak = profile?.currentStreak ?? 0
    const today = displayDate(new Date())

    return (
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={celebrationActive ? 'auto' : 'none'}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable
          style={styles.pressable}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('streakDisplay.freeze.celebrationTitle')}
        >
          <View style={[styles.backdrop, { backgroundColor: tokens.bg }]} />
          <View style={styles.content} pointerEvents="none">
            <RingMotif
              ringCount={3}
              ringSize={280}
              dashed
              ringColor={tokens.statusFrozen}
              eyebrow={t('streakDisplay.freeze.eyebrow', { date: today })}
              eyebrowColor={tokens.statusFrozen}
              anchor={
                <Animated.View
                  style={[
                    styles.heroDisc,
                    {
                      backgroundColor: rgbaFromHex(tokens.statusFrozen, 0.16),
                    },
                    orbStyle,
                  ]}
                >
                  <Text style={styles.heroEmoji}>❄️</Text>
                </Animated.View>
              }
            />
            <Animated.Text style={[styles.streakNumber, { color: tokens.fg1 }, titleStyle]}>
              {streak}
            </Animated.Text>
            <Animated.Text style={[styles.subtitle, { color: tokens.fg2 }, subtitleStyle]}>
              {t('streakDisplay.freeze.celebrationSubtitle')}
            </Animated.Text>
          </View>
        </Pressable>
      </Animated.View>
    )
  },
)

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: zLayers.celebration,
  },
  pressable: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.96,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  heroDisc: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 60,
    lineHeight: 72,
  },
  streakNumber: {
    marginTop: 12,
    fontFamily: 'Inter_700Bold',
    fontSize: 56,
    letterSpacing: -1.12,
    lineHeight: 56,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
})
