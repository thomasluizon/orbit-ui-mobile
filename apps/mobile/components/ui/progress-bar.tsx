import { useEffect, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the bar scaleX on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2, easings, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ProgressBarProps {
  /** Fill ratio between 0 and 1 (values outside the range are clamped). */
  progress: number
  label: string
  /** Fill color override (defaults to the scheme primary). */
  color?: string
  style?: StyleProp<ViewStyle>
}

const FILL_MS = 220

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Kit progress bar: 8px pill track with a primary fill animated via scaleX only. */
export function ProgressBar({ progress, label, color, style }: Readonly<ProgressBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const clamped = Math.min(1, Math.max(0, progress))
  const [scaleX] = useState(() => new Animated.Value(clamped))

  useEffect(() => {
    if (prefersReducedMotion) {
      scaleX.setValue(clamped)
      return
    }
    Animated.timing(scaleX, {
      toValue: clamped,
      duration: FILL_MS,
      easing: toAnimatedEasing(easings.smooth),
      useNativeDriver: true,
    }).start()
  }, [clamped, prefersReducedMotion, scaleX])

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: rgbaFromHex(tokens.fg1, 0.08) }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color ?? tokens.primary,
            transform: [{ scaleX }],
            transformOrigin: 'left',
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: radius.full,
  },
})
