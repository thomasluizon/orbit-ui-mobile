import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { CheckCheck, SquareX } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { createStyles } from '@/app/calendar-sync-styles'

interface SelectAllToggleProps {
  allSelected: boolean
  onToggle: () => void
  selectAllLabel: string
  deselectAllLabel: string
  disabled?: boolean
  tokens: ReturnType<typeof createTokensV2>
  tintStyle: StyleProp<ViewStyle>
}

/** Icon Pressable that selects or deselects every calendar event; its label is the accessible name. */
export function SelectAllToggle({
  allSelected,
  onToggle,
  selectAllLabel,
  deselectAllLabel,
  disabled = false,
  tokens,
  tintStyle,
}: Readonly<SelectAllToggleProps>) {
  const styles = createStyles()
  const accessibilityState = disabled
    ? { selected: allSelected, disabled: true }
    : { selected: allSelected }
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={allSelected ? deselectAllLabel : selectAllLabel}
      accessibilityState={accessibilityState}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.quietActionIcon,
        tintStyle,
        (pressed || disabled) && styles.quietActionDim,
      ]}
    >
      {allSelected ? (
        <SquareX size={20} color={tokens.fg2} strokeWidth={2} />
      ) : (
        <CheckCheck size={20} color={tokens.fg2} strokeWidth={2} />
      )}
    </Pressable>
  )
}
