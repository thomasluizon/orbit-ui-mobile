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
import { createTokensV2, darkenHex, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface PillButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  onPress?: () => void
  disabled?: boolean
  busy?: boolean
  fullWidth?: boolean
  leading?: ReactNode
  accessibilityLabel?: string
  /** Omit (with a `leading` icon + `accessibilityLabel`) for an icon-only square control. */
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

/** Kit pill CTA in the canonical taxonomy: solid `primary`, inverted
 *  `secondary`, hairline `ghost`, or status-bad `destructive`. `size` (`sm` /
 *  `md` / `lg`) drives a fixed height + horizontal padding + label/icon scale
 *  from the shared `BUTTON_SIZES` geometry so the web mirror cannot drift.
 *  While `busy`, a spinner fills the leading slot, the label dims, and presses
 *  no-op. With a `leading` icon and no label child it renders an icon-only
 *  square (width = the size's height); pass `accessibilityLabel` for its name. */
export function PillButton({
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  busy = false,
  fullWidth = false,
  leading,
  accessibilityLabel,
  children,
  style,
}: Readonly<PillButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const sizeSpec = BUTTON_SIZES[size]
  const hasLabel = children !== undefined && children !== null && children !== ''
  const iconOnly = !hasLabel && leading != null

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
        iconOnly
          ? { height: sizeSpec.height, width: sizeSpec.height, paddingHorizontal: 0, gap: 0 }
          : { height: sizeSpec.height, paddingHorizontal: sizeSpec.paddingX, gap: sizeSpec.gap },
        variantStyle(pressed),
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
      {hasLabel &&
        // react-doctor-disable-next-line no-polymorphic-children -- deliberate label-or-node API: a string/number child renders as the themed label, any other node renders as-is; matches the web PillButton contract https://github.com/thomasluizon/orbit-ui-mobile/issues/243
        (typeof children === 'string' || typeof children === 'number' ? (
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
        ))}
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
    transform: [{ scale: 0.97 }],
  },
  label: {
    fontFamily: 'Rubik_500Medium',
  },
  labelBusy: {
    opacity: 0.6,
  },
})
