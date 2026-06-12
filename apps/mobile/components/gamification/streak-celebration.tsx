import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { useCelebrationEntrance } from './celebration-motion'
import { RingMotif } from './ring-motif'

const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const

/**
 * Streak celebration: emoji hero disc inside the Saturn-ring motif with the
 * streak count as a big Inter numeral. Preserves dismiss + milestone branch.
 */
export function StreakCelebration() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const streakCelebration = useUIStore((s) => s.streakCelebration)
  const setStreakCelebration = useUIStore((s) => s.setStreakCelebration)
  const [streakCount, setStreakCount] = useState(0)

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { orbStyle, titleStyle, subtitleStyle } =
    useCelebrationEntrance(Boolean(streakCelebration))

  const isMilestone = useMemo(
    () => (MILESTONE_VALUES as readonly number[]).includes(streakCount),
    [streakCount],
  )

  const encouragement = useMemo(() => {
    if (isMilestone) {
      return t('streakDisplay.celebration.milestone')
    }
    return t('streakDisplay.celebration.keepGoing')
  }, [isMilestone, t])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setStreakCelebration(null)
    })
  }, [overlayOpacity, setStreakCelebration])

  useEffect(() => {
    if (!streakCelebration) return

    setStreakCount(streakCelebration.streak)
    overlayOpacity.setValue(0)

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    dismissTimerRef.current = setTimeout(dismiss, 2500)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [streakCelebration, dismiss, overlayOpacity])

  if (!streakCelebration) return null

  const subtitle = plural(
    t('streakDisplay.celebration.subtitle', { count: streakCount }),
    streakCount,
  )

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Pressable style={styles.pressable} onPress={dismiss} accessibilityLabel={subtitle}>
        <View style={[styles.backdrop, { backgroundColor: tokens.bg }]} />
        <GradientTop height={520} />
        <View style={styles.content} pointerEvents="none">
          <RingMotif
            ringCount={4}
            ringSize={280}
            eyebrow={t('streakDisplay.celebration.eyebrow')}
            anchor={
              <Animated.View
                style={[
                  styles.heroDisc,
                  {
                    backgroundColor: tintFromPrimary(tokens, 0.16),
                    shadowColor: tokens.primary,
                  },
                  orbStyle,
                ]}
              >
                <Text style={styles.heroEmoji}>🔥</Text>
              </Animated.View>
            }
          />
          <Animated.Text style={[styles.streakNumber, { color: tokens.fg1 }, titleStyle]}>
            {streakCount}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: tokens.fg2 }, subtitleStyle]}>
            {subtitle}
            {isMilestone ? (
              <Text style={{ color: tokens.fg3 }}>{`  ·  ${encouragement}`}</Text>
            ) : null}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10002,
  },
  pressable: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 60,
    elevation: 8,
  },
  heroEmoji: {
    fontSize: 60,
    lineHeight: 72,
  },
  streakNumber: {
    marginTop: 12,
    fontFamily: 'Inter_700Bold',
    fontSize: 60,
    letterSpacing: -1.2,
    lineHeight: 60,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
})
