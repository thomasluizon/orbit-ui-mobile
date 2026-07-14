import { useMemo, useEffect, useRef, useCallback } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { useCelebrationEntrance } from './celebration-motion'
import { RingMotif } from './ring-motif'

/**
 * All-done celebration: full-screen canvas takeover with gradient header and
 * emoji hero disc inside the Saturn-ring motif. Auto-closes; tap dismisses early.
 */
export function AllDoneCelebration() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const allDoneCelebration = useUIStore((s) => s.allDoneCelebration)
  const setAllDoneCelebration = useUIStore((s) => s.setAllDoneCelebration)

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { orbStyle, titleStyle, subtitleStyle } =
    useCelebrationEntrance(Boolean(allDoneCelebration))

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start(() => {
      setAllDoneCelebration(false)
    })
  }, [overlayOpacity, setAllDoneCelebration])

  useEffect(() => {
    if (!allDoneCelebration) return

    overlayOpacity.setValue(0)

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start()

    dismissTimerRef.current = setTimeout(dismiss, 3500)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [allDoneCelebration, dismiss, overlayOpacity])

  if (!allDoneCelebration) return null

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
        accessibilityLabel={t('habits.allDoneCelebrationTitle')}
      >
        <View
          style={[styles.backdrop, { backgroundColor: tokens.bg }]}
        />
        <GradientTop height={520} />
        <View style={styles.content} pointerEvents="none">
          <RingMotif
            ringCount={3}
            ringSize={280}
            anchor={
              <Animated.View
                style={[
                  styles.heroDisc,
                  {
                    backgroundColor: tintFromPrimary(tokens, 0.16),
                    boxShadow: `0px 0px 60px ${tintFromPrimary(tokens, 0.4)}`,
                  },
                  orbStyle,
                ]}
              >
                <Text style={styles.heroEmoji}>🎉</Text>
              </Animated.View>
            }
          />
          <Animated.Text style={[styles.title, { color: tokens.fg1 }, titleStyle]}>
            {t('habits.allDoneCelebrationTitle')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: tokens.fg2 }, subtitleStyle]}>
            {t('habits.allDoneCelebrationSubtitle')}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10003,
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
})
