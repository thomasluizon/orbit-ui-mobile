import type { StyleProp, ViewStyle } from 'react-native'
import { CheckCheck, SquareX } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
import { MotionPressable } from '@/components/ui/motion-pressable'

interface SelectAllToggleProps {
  allSelected: boolean
  onToggle: () => void
  selectAllLabel: string
  deselectAllLabel: string
  tokens: ReturnType<typeof createTokensV2>
  tintStyle: StyleProp<ViewStyle>
}

/** Icon Pressable that selects or deselects every calendar event; its label is the accessible name. */
export function SelectAllToggle({
  allSelected,
  onToggle,
  selectAllLabel,
  deselectAllLabel,
  tokens,
  tintStyle,
}: Readonly<SelectAllToggleProps>) {
  const styles = createStyles()
  return (
    <MotionPressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={allSelected ? deselectAllLabel : selectAllLabel}
      accessibilityState={{ selected: allSelected }}

      style={({ pressed }) => [
        styles.quietActionIcon,
        tintStyle,
        { backgroundColor: pressed ? tokens.bgHover : 'transparent' },
      ]}
    >
      {allSelected ? (
        <SquareX size={20} color={tokens.fg2} strokeWidth={2} />
      ) : (
        <CheckCheck size={20} color={tokens.fg2} strokeWidth={2} />
      )}
    </MotionPressable>
  )
}
