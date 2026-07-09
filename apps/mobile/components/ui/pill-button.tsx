import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { BUTTON_SIZES, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'
import { createTokensV2, darkenHex, primaryGlow, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface PillButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  fullWidth?: boolean
  glow?: boolean
  leading?: ReactNode
  accessibilityLabel?: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/** Kit pill CTA in the canonical taxonomy: glowing `primary`, inverted
 *  `secondary`, hairline `ghost`, or status-bad `destructive`. `size` (`sm` /
 *  `md` / `lg`) drives a fixed height + horizontal padding + label/icon scale
 *  from the shared `BUTTON_SIZES` geometry so the web mirror cannot drift.
 *  While `busy`, a spinner fills the leading slot, the label dims, and presses
 *  no-op. */
export function PillButton({
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  busy = false,
  fullWidth = false,
  glow = true,
  leading,
  accessibilityLabel,
  children,
  style,
}: Readonly<PillButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const sizeSpec = BUTTON_SIZES[size]

  const textColorByVariant: Record<ButtonVariant, string> = {
    primary: tokens.fgOnPrimary,
    secondary: tokens.bg,
    ghost: tokens.fg1,
    destructive: tokens.fgOnBad,
  }

  const variantStyle = (pressed: boolean): ViewStyle => {
    if (variant === 'secondary') {
      return { backgroundColor: tokens.fg1 }
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: pressed ? tokens.bgCard : 'transparent',
        borderWidth: 1.5,
        borderColor: tokens.hairlineStrong,
      }
    }
    if (variant === 'destructive') {
      return {
        backgroundColor: pressed ? darkenHex(tokens.statusBad, 0.15) : tokens.statusBad,
      }
    }
    return {
      backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
    }
  }

  const quietsOnPress = variant === 'secondary'

  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.base,
        { height: sizeSpec.height, paddingHorizontal: sizeSpec.paddingX, gap: sizeSpec.gap },
        variantStyle(pressed),
        variant === 'primary' && glow && !disabled ? primaryGlow(tokens) : null,
        fullWidth ? styles.fullWidth : null,
        disabled ? styles.disabled : null,
        pressed && quietsOnPress ? styles.pressedQuiet : null,
        pressed ? styles.pressedScale : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={textColorByVariant[variant]} />
      ) : (
        leading
      )}
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text
          style={[
            styles.label,
            { color: textColorByVariant[variant], fontSize: sizeSpec.fontSize },
            busy ? styles.labelBusy : null,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  pressedQuiet: {
    opacity: 0.85,
  },
  pressedScale: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: 'Rubik_500Medium',
  },
  labelBusy: {
    opacity: 0.6,
  },
})
