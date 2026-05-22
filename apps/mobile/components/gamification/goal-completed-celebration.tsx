import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui-store'
import { RingMotif } from './ring-motif'

/**
 * v8 Goal-completed celebration: Saturn-ring motif with mono uppercase goal label.
 * Pure visual layer -- preserves dismiss + store-driven trigger.
 */
export function GoalCompletedCelebration() {
  const { t } = useTranslation()
  const goalCompletedCelebration = useUIStore((s) => s.goalCompletedCelebration)
  const setGoalCompletedCelebration = useUIStore(
    (s) => s.setGoalCompletedCelebration,
  )
  const [goalName, setGoalName] = useState('')

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror store-driven trigger into local presentation state
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
        accessibilityLabel={t('goals.completedCelebrationTitle')}
      >
        <View style={styles.backdrop} />
        <RingMotif
          ringCount={4}
          ringSize={130}
          body={t('goals.completedCelebrationFiled')}
          anchor={
            <Text style={styles.anchorText}>
              {t('goals.completedCelebrationLabel', { name: goalName })}
            </Text>
          }
        />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  anchorText: {
    fontFamily: 'GeistMono',
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
})
