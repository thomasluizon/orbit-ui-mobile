import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { useCelebrationEntrance } from './celebration-motion'
import { RingMotif } from './ring-motif'

/**
 * Goal-completed celebration: trophy hero disc inside the Saturn-ring motif.
 * Pure visual layer -- preserves dismiss + store-driven trigger.
 */
export function GoalCompletedCelebration() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const goalCompletedCelebration = useUIStore((s) => s.goalCompletedCelebration)
  const setGoalCompletedCelebration = useUIStore(
    (s) => s.setGoalCompletedCelebration,
  )
  const [goalName, setGoalName] = useState('')

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { orbStyle, titleStyle, subtitleStyle, footerStyle } =
    useCelebrationEntrance(Boolean(goalCompletedCelebration))

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setGoalCompletedCelebration(null)
    })
  }, [overlayOpacity, setGoalCompletedCelebration])

  useEffect(() => {
    if (!goalCompletedCelebration) return

    setGoalName(goalCompletedCelebration.name)
    overlayOpacity.setValue(0)

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    dismissTimerRef.current = setTimeout(dismiss, 3500)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [goalCompletedCelebration, dismiss, overlayOpacity])

  if (!goalCompletedCelebration) return null

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Pressable
        style={styles.pressable}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('goals.completedCelebrationTitle')}
      >
        <View style={[styles.backdrop, { backgroundColor: tokens.bg }]} />
        <GradientTop height={520} />
        <View style={styles.content} pointerEvents="none">
          <RingMotif
            ringCount={4}
            ringSize={280}
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
                <Text style={styles.heroEmoji}>🏆</Text>
              </Animated.View>
            }
          />
          <Animated.Text style={[styles.title, { color: tokens.fg1 }, titleStyle]}>
            {t('goals.completedCelebrationTitle')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: tokens.fg2 }, subtitleStyle]}>
            {t('goals.completedCelebrationLabel', { name: goalName })}
          </Animated.Text>
          <Animated.Text style={[styles.meta, { color: tokens.fg3 }, subtitleStyle]}>
            {t('goals.completedCelebrationFiled')}
          </Animated.Text>
        </View>
        <Animated.View
          style={[styles.footer, { paddingBottom: insets.bottom + 24 }, footerStyle]}
        >
          <PillButton fullWidth onPress={dismiss}>
            {t('common.continue')}
          </PillButton>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10003,
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
  title: {
    marginTop: 12,
    fontFamily: 'Rubik_500Medium',
    fontSize: 28,
    letterSpacing: -0.28,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  meta: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
  },
})
