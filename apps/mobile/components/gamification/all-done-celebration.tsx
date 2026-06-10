import { useMemo, useEffect, useRef, useCallback } from 'react'
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
 * v8 All-done celebration: Saturn-ring motif with mono uppercase title.
 * Pure presentation -- visual layer only. Preserves dismiss + auto-close behavior.
 */
export function AllDoneCelebration() {
  const { t } = useTranslation()
  const allDoneCelebration = useUIStore((s) => s.allDoneCelebration)
  const setAllDoneCelebration = useUIStore((s) => s.setAllDoneCelebration)

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
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
      duration: 300,
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
        accessibilityLabel={t('habits.allDoneCelebrationTitle')}
      >
        <View style={styles.backdrop} />
        <RingMotif
          ringCount={3}
          ringSize={280}
          body={t('habits.allDoneCelebrationSubtitle')}
          anchor={
            <Text style={styles.anchorText}>
              {t('habits.allDoneCelebrationTitle')}
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
    fontFamily: 'Roboto_500Medium',
    fontSize: 22,
    color: '#fff',
    letterSpacing: 1.32,
    textTransform: 'uppercase',
  },
})
