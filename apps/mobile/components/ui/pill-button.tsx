import { useContext, useState, type Ref } from 'react'
import { ActionRowContext } from './action-row'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  type View,
} from 'react-native'
import { GOOGLE_SIGN_IN_BUTTON, BUTTON_SIZES, MATCHED_PILL_WIDTH, TOUCH_TARGET_MIN, SMALL_PILL_VISIBLE_MIN, type ButtonVariant } from '@orbit/shared/theme'
import { createTokensV2, mixHex, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const SMALL_PILL_HIT_PADDING = (TOUCH_TARGET_MIN - SMALL_PILL_VISIBLE_MIN) / 2

/** The canonical five-variant pill action in the shared two-size geometry. */
export function Button({
  buttonRef,
  minimumHeight,
  expanded,
  elevated = false,
  variant = 'primary',
  size: requestedSize = 'sm',
  onClick,
  onFocus,
  onBlur,
  onHoverIn,
  onHoverOut,
  disabled = false,
  loading = false,
  children,
  accessibleName,
  iconOnly,
  matchedWidth = false,
  label,
  leadingIcon,
  brand,
  hint,
  accessibilityRole = 'button',
  quiet = false,
}: Readonly<ButtonProps & { buttonRef?: Ref<View>; accessibilityRole?: 'button' | 'link'; quiet?: boolean; expanded?: boolean; onFocus?: () => void; onBlur?: () => void; onHoverIn?: () => void; onHoverOut?: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const size = useContext(ActionRowContext) ? 'sm' : requestedSize
  const sizeSpec = BUTTON_SIZES[size]
  const prefersReducedMotion = usePrefersReducedMotion()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const textColorByVariant: Record<ButtonVariant, string> = {
    primary: tokens.fgOnPrimary,
    secondary: tokens.bg,
    ghost: quiet ? tokens.fg2 : tokens.fg1,
    destructive: tokens.fgOnBad,
    caution: tokens.fgOnOverdue,
  }

  const ghostPressedFill = elevated ? tokens.bgElevHover : quiet ? tokens.bgHoverOpaque : tokens.bgHover
  const ghostFill = elevated ? tokens.bgElev : 'transparent'
  const variantStyle = (pressed: boolean): ViewStyle => {
    if (variant === 'secondary') {
      return { backgroundColor: pressed ? mixHex(tokens.fg1, tokens.bg, 0.1) : tokens.fg1 }
    }
    if (variant === 'ghost') {
      const active = pressed || (hovered && !disabled && !loading)
      return {
        backgroundColor: active ? ghostPressedFill : ghostFill,
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

  return (
    <Pressable
      ref={buttonRef}
      hitSlop={size === 'sm' && (!iconOnly || (minimumHeight ?? 0) < TOUCH_TARGET_MIN) ? SMALL_PILL_HIT_PADDING : undefined}
      onPress={loading ? undefined : onClick}
      onFocus={() => { setFocused(true); onFocus?.() }}
      onBlur={() => { setFocused(false); onBlur?.() }}
      onHoverIn={() => { setHovered(true); onHoverIn?.() }}
      onHoverOut={() => { setHovered(false); onHoverOut?.() }}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={iconOnly ? label : accessibleName}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || loading, busy: loading, ...(expanded === undefined ? {} : { expanded }) }}
      testID={`button-${variant}-${size}`}
      style={({ pressed }) => [
        styles.base,
        iconOnly
          ? { height: Math.max(minimumHeight ?? sizeSpec.height, SMALL_PILL_VISIBLE_MIN), width: Math.max(minimumHeight ?? sizeSpec.height, SMALL_PILL_VISIBLE_MIN), paddingHorizontal: 0, gap: 0 }
          : { height: minimumHeight === undefined ? Math.max(sizeSpec.height, SMALL_PILL_VISIBLE_MIN) : undefined, minHeight: Math.max(minimumHeight ?? 0, SMALL_PILL_VISIBLE_MIN), width: matchedWidth ? MATCHED_PILL_WIDTH : undefined, paddingVertical: 4, paddingHorizontal: sizeSpec.paddingX, paddingStart: leadingIcon ? sizeSpec.paddingX - 2 : sizeSpec.paddingX, gap: sizeSpec.gap },
        brand === 'google' ? { paddingHorizontal: GOOGLE_SIGN_IN_BUTTON.paddingX, paddingStart: GOOGLE_SIGN_IN_BUTTON.paddingX, gap: GOOGLE_SIGN_IN_BUTTON.gap } : null,
        variantStyle(pressed && !disabled && !loading),
        focused ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.fg1, outlineOffset: 2 } : null,
        disabled && !loading ? styles.disabled : null,
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
    minHeight: SMALL_PILL_VISIBLE_MIN,
    minWidth: SMALL_PILL_VISIBLE_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
  pressedScale: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Geist_500Medium',
  },
})

export { Button as PillButton }
