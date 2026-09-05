import type { ButtonProps } from '@orbit/shared/contracts/actions'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native'
import { BUTTON_SIZES, type ButtonVariant } from '@orbit/shared/theme'
import { createTokensV2, darkenHex, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** The canonical five-variant pill action in the shared two-size geometry. */
export function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  children,
  accessibleName,
  iconOnly,
  label,
}: Readonly<ButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const sizeSpec = BUTTON_SIZES[size]

  const textColorByVariant: Record<ButtonVariant, string> = {
    primary: tokens.fgOnPrimary,
    secondary: tokens.bg,
    ghost: tokens.fg1,
    destructive: tokens.fgOnBad,
    caution: tokens.fgOnOverdue,
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
    if (variant === 'caution') {
      return {
        backgroundColor: pressed ? darkenHex(tokens.statusOverdue, 0.15) : tokens.statusOverdue,
      }
    }
    return {
      backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
    }
  }

  const quietsOnPress = variant === 'secondary'

  return (
    <Pressable
      hitSlop={Math.max(0, (44 - sizeSpec.height) / 2)}
      onPress={loading ? undefined : onClick}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={iconOnly ? label : accessibleName}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={`button-${variant}-${size}`}
      style={({ pressed }) => [
        styles.base,
        iconOnly
          ? { height: sizeSpec.height, width: sizeSpec.height, paddingHorizontal: 0, gap: 0 }
          : { height: sizeSpec.height, paddingHorizontal: sizeSpec.paddingX, gap: sizeSpec.gap },
        variantStyle(pressed),
        disabled ? styles.disabled : null,
        pressed && quietsOnPress ? styles.pressedQuiet : null,
        pressed ? styles.pressedScale : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColorByVariant[variant]} />
      ) : iconOnly ? children : null}
      {iconOnly ? null : (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: textColorByVariant[variant], fontSize: sizeSpec.fontSize },
            loading ? styles.labelBusy : null,
          ]}
        >
          {children}
        </Text>
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
  disabled: {
    opacity: 0.4,
  },
  pressedQuiet: {
    opacity: 0.85,
  },
  pressedScale: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Geist_500Medium',
  },
  labelBusy: {
    opacity: 0.6,
  },
})

export { Button as PillButton }
