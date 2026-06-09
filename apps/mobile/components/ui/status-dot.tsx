import { useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Pressable, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const SWEEP_MS = 420

export type StatusDotState =
  | 'done'
  | 'empty'
  | 'skip'
  | 'overdue'
  | 'bad'
  | 'frozen'

interface StatusDotProps {
  state: StatusDotState
  /** Dot size in px (default 8 per v8 spec). */
  size?: number
  /** Tap handler; the surrounding pressable has generous hit-slop. */
  onToggle?: () => void
  /** Accessibility label for screen readers (defaults to the state name). */
  accessibilityLabel?: string
  /** Read-only mode: dimmed, non-interactive (mirrors the backend log rule). */
  disabled?: boolean
}

/** v8 8px desaturated status dot. Hollow ring for `empty`, filled otherwise.
 *  On an interactive transition into `done`, a `primary` arc sweeps once around
 *  the dot and the fill settles in (the Today completion signature). */
export function StatusDot({
  state,
  size = 8,
  onToggle,
  accessibilityLabel,
  disabled = false,
}: Readonly<StatusDotProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isFilled = state === 'done' || state === 'skip' || state === 'frozen'
  const interactive = !!onToggle && !disabled

  const colorMap: Record<StatusDotState, string> = {
    done: tokens.statusDone,
    empty: tokens.statusEmpty,
    skip: tokens.statusSkip,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
    frozen: tokens.statusFrozen,
  }
  const color = colorMap[state]

  const sweep = useMemo(() => new Animated.Value(0), [])

  const [prevState, setPrevState] = useState(state)
  const [playing, setPlaying] = useState(false)
  if (state !== prevState) {
    setPrevState(state)
    setPlaying(prevState !== 'done' && state === 'done' && interactive)
  }

  useEffect(() => {
    if (!playing) return
    sweep.setValue(0)
    Animated.timing(sweep, {
      toValue: 1,
      duration: SWEEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    const id = setTimeout(() => setPlaying(false), SWEEP_MS + 40)
    return () => clearTimeout(id)
  }, [playing, sweep])

  const trackStroke = 1.5
  const trackR = (size - trackStroke) / 2
  const pieR = size / 4
  const pieStroke = size / 2
  const c = 2 * Math.PI * pieR
  const dashOffset = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [c, 0],
  })

  const dot = playing ? (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={trackR}
          fill="none"
          stroke={tokens.statusEmpty}
          strokeWidth={trackStroke}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={pieR}
          fill="none"
          stroke={tokens.primary}
          strokeWidth={pieStroke}
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
        />
      </Svg>
    </View>
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: isFilled ? color : 'transparent',
        borderWidth: isFilled ? 0 : 1.5,
        borderColor: isFilled ? 'transparent' : color,
      }}
    />
  )

  if (!onToggle || disabled) {
    return (
      <View
        accessibilityLabel={accessibilityLabel ?? state}
        accessibilityRole="image"
        style={disabled ? { opacity: 0.4 } : undefined}
      >
        {dot}
      </View>
    )
  }

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? state}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.9 : 1 }],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {dot}
    </Pressable>
  )
}
