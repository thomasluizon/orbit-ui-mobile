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
import { useUIStore } from '@/stores/ui-store'
import { RingMotif } from './ring-motif'

const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const

/**
 * v8 Streak celebration: Saturn-ring motif with mono giant number.
 * Pure visual layer -- preserves dismiss + milestone branch.
 */
export function StreakCelebration() {
  const { t } = useTranslation()
  const streakCelebration = useUIStore((s) => s.streakCelebration)
  const setStreakCelebration = useUIStore((s) => s.setStreakCelebration)
  const [streakCount, setStreakCount] = useState(0)

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror store-driven trigger into local presentation state
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
        <View style={styles.backdrop} />
        <RingMotif
          ringCount={4}
          ringSize={180}
          eyebrow={t('streakDisplay.celebration.eyebrow')}
          anchor={<Text style={styles.streakNumber}>{streakCount}</Text>}
          body={
            isMilestone ? `${subtitle}  ·  ${encouragement}` : subtitle
          }
        />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  streakNumber: {
    fontFamily: 'GeistMono',
    fontSize: 96,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -2.88,
    lineHeight: 86,
  },
})
