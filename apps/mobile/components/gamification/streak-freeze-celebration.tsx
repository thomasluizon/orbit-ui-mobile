import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  forwardRef,
  useCallback,
} from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProfile } from '@/hooks/use-profile'
import { RingMotif } from './ring-motif'

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

/**
 * v8 Streak-freeze celebration: dashed Saturn-ring motif in frozen blue.
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

    const overlayOpacity = useRef(new Animated.Value(0)).current
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const isShowingRef = useRef(false)

    const dismiss = useCallback(() => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        isShowingRef.current = false
      })
    }, [overlayOpacity])

    function show() {
      if (isShowingRef.current) return
      isShowingRef.current = true

      overlayOpacity.setValue(0)
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
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
        pointerEvents={isShowingRef.current ? 'auto' : 'none'}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable
          style={styles.pressable}
          onPress={dismiss}
          accessibilityLabel={t('streakDisplay.freeze.celebrationTitle')}
        >
          <View style={styles.backdrop} />
          <RingMotif
            ringCount={3}
            ringSize={220}
            dashed
            ringColor={tokens.statusFrozen}
            eyebrow={t('streakDisplay.freeze.eyebrow', { date: today })}
            eyebrowColor={tokens.statusFrozen}
            anchor={<Text style={styles.streakNumber}>{streak}</Text>}
            body={t('streakDisplay.freeze.celebrationSubtitle')}
          />
        </Pressable>
      </Animated.View>
    )
  },
)

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10003,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  streakNumber: {
    fontFamily: 'GeistMono',
    fontSize: 64,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -1.92,
  },
})
