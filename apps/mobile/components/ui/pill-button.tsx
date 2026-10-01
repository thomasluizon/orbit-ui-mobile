import type { ButtonProps } from '@orbit/shared/contracts/actions'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native'
import { BUTTON_SIZES, MATCHED_PILL_WIDTH, type ButtonVariant } from '@orbit/shared/theme'
import { createTokensV2, mixHex, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'

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
  matchedWidth = false,
  label,
  leadingIcon,
  hint,
  accessibilityRole = 'button',
  quiet = false,
}: Readonly<ButtonProps & { accessibilityRole?: 'button' | 'link'; quiet?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const sizeSpec = BUTTON_SIZES[size]
  const prefersReducedMotion = usePrefersReducedMotion()

  const textColorByVariant: Record<ButtonVariant, string> = {
    primary: tokens.fgOnPrimary,
    secondary: tokens.bg,
    ghost: quiet ? tokens.fg2 : tokens.fg1,
    destructive: tokens.fgOnBad,
    caution: tokens.fgOnOverdue,
  }

  const variantStyle = (pressed: boolean): ViewStyle => {
    if (variant === 'secondary') {
      return { backgroundColor: tokens.fg1 }
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: pressed ? tokens.bgHover : 'transparent',
        borderWidth: 1.5,
        borderColor: tokens.hairlineStrong,
      }
    }
    if (variant === 'destructive') {
      return {
        backgroundColor: pressed ? mixHex(tokens.statusBad, tokens.fg1, 0.15) : tokens.statusBad,
      }
    }
    if (variant === 'caution') {
      return {
        backgroundColor: pressed ? mixHex(tokens.statusOverdue, '#000000', 0.15) : tokens.statusOverdue,
      }
    }
    return {
      backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
    }
  }

  const quietsOnPress = variant === 'secondary'

  return (
    <Pressable
      onPress={loading ? undefined : onClick}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={iconOnly ? label : accessibleName}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={`button-${variant}-${size}`}
      style={({ pressed }) => [
        styles.base,
        iconOnly
          ? { height: sizeSpec.height, width: sizeSpec.height, paddingHorizontal: 0, gap: 0 }
          : { height: sizeSpec.height, width: matchedWidth ? MATCHED_PILL_WIDTH : undefined, paddingHorizontal: sizeSpec.paddingX, paddingStart: leadingIcon ? sizeSpec.paddingX - 2 : sizeSpec.paddingX, gap: sizeSpec.gap },
        variantStyle(pressed && !disabled && !loading),
        disabled && !loading ? styles.disabled : null,
        pressed && !disabled && !loading && quietsOnPress ? styles.pressedQuiet : null,
        pressed && !disabled && !loading && !prefersReducedMotion ? styles.pressedScale : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColorByVariant[variant]} />
      ) : iconOnly ? children : leadingIcon}
      {iconOnly ? null : (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: textColorByVariant[variant], fontSize: sizeSpec.fontSize },
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  )
}

/** Native navigation with the same visual contract as PillButton. */
export function PillLink({ onPress, children }: Readonly<{ onPress: () => void; children: string }>) {
  return <Button accessibilityRole="link" onClick={onPress}>{children}</Button>
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    overflow: 'hidden',
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
})

export { Button as PillButton }
