import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { CheckCheck, SquareX } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { createStyles } from './calendar-sync-styles'

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
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={allSelected ? deselectAllLabel : selectAllLabel}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.quietActionIcon,
        tintStyle,
        pressed && styles.quietActionDim,
      ]}
    >
      {allSelected ? (
        <SquareX size={18} color={tokens.fg2} strokeWidth={2} />
      ) : (
        <CheckCheck size={18} color={tokens.fg2} strokeWidth={2} />
      )}
    </Pressable>
  )
}
