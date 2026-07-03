import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { createTokensV2, primaryGlow, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type PillButtonVariant = 'primary' | 'white' | 'ghost'

interface PillButtonProps {
  variant?: PillButtonVariant
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

/** Kit pill CTA: glowing primary, inverted white, or hairline ghost variant.
 *  While `busy`, a spinner fills the leading slot, the label dims, and
 *  presses no-op. */
export function PillButton({
  variant = 'primary',
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

  const textColorByVariant: Record<PillButtonVariant, string> = {
    primary: tokens.fgOnPrimary,
    white: tokens.bg,
    ghost: tokens.fg1,
  }

  const variantStyle = (pressed: boolean): ViewStyle => {
    if (variant === 'white') {
      return { backgroundColor: tokens.fg1, paddingVertical: 14 }
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: pressed ? tokens.bgCard : 'transparent',
        borderWidth: 1.5,
        borderColor: tokens.hairlineStrong,
        paddingVertical: 14,
      }
    }
    return {
      backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
      paddingVertical: 15,
    }
  }

  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.base,
        variantStyle(pressed),
        variant === 'primary' && glow && !disabled ? primaryGlow(tokens) : null,
        fullWidth ? styles.fullWidth : null,
        disabled ? styles.disabled : null,
        pressed && variant === 'white' ? styles.pressedQuiet : null,
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
            { color: textColorByVariant[variant] },
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
    gap: 9,
    borderRadius: radius.full,
    paddingHorizontal: 26,
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
    fontSize: 16,
  },
  labelBusy: {
    opacity: 0.6,
  },
})
