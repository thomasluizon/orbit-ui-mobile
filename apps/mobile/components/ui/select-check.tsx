import { Pressable, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SelectCheckProps {
  selected: boolean
  /** Box size in px (default 18 per v8 spec). */
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
}

/** v8 18px primary-filled checkbox used in select-mode rows. */
export function SelectCheck({
  selected,
  size = 18,
  onPress,
  accessibilityLabel,
}: Readonly<SelectCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? 'Select'}
      accessibilityState={{ checked: selected }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={{
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: 4,
            backgroundColor: tokens.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check
            size={size * 0.62}
            color={tokens.fgOnPrimary}
            strokeWidth={3}
          />
        </View>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: 4,
            borderWidth: 1.5,
            borderColor: tokens.hairlineStrong,
          }}
        />
      )}
    </Pressable>
  )
}
