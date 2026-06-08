import { Pressable, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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

/** v8 8px desaturated status dot. Hollow ring for `empty`, filled for everything else. */
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

  const colorMap: Record<StatusDotState, string> = {
    done: tokens.statusDone,
    empty: tokens.statusEmpty,
    skip: tokens.statusSkip,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
    frozen: tokens.statusFrozen,
  }
  const color = colorMap[state]

  const dot = (
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
