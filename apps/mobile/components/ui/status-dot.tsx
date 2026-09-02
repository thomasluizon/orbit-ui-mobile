import { Pressable, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { resolveStatusDotFill } from '@/components/ui/status-dot-fill'

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

/** v8 8px desaturated status dot. Completion remains a neutral, static cue. */
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
    skip: tokens.fg3,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
    frozen: tokens.fg2,
  }
  const color = colorMap[state]

  const dot = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        ...resolveStatusDotFill(isFilled, color),
      }}
    />
  )

  if (!onToggle) {
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
      disabled={disabled}
      hitSlop={Math.max(0, (44 - size) / 2)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? state}
      accessibilityState={{ disabled }}
      style={({ pressed }) => {
        const pressedOpacity = pressed ? 0.85 : 1
        return {
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
          opacity: disabled ? 0.4 : pressedOpacity,
        }
      }}
    >
      {dot}
    </Pressable>
  )
}
