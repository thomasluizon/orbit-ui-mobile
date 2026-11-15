import { useComposedRefs } from '@rn-primitives/hooks'
import { cloneElement, isValidElement, useContext, useState, type Ref } from 'react'
import { ActionRowContext } from './action-row'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import {
  StyleSheet,
  Text,
  type ViewStyle,
  type PressableProps,
  View,
  useWindowDimensions,
} from 'react-native'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { SPACING, APPLE_SIGN_IN_BUTTON, APPLE_SIGN_IN_TITLE_SIZE, ICON_ACTION_START_HANG, BUTTON_SIZES, MATCHED_PILL_WIDTH, TOUCH_TARGET_MIN, SIGN_IN_BUTTON_HEIGHT, SMALL_PILL_VISIBLE_MIN, signInButtonSpec, type ButtonVariant, type SignInButtonSpec } from '@orbit/shared/theme'
import { createTokensV2, mixHex, radius, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ThemedMotionPressable } from './motion-pressable'
import { SkeletonFace } from './skeleton'
import { OrbitMascot } from './orbit-mascot'

const SMALL_PILL_HIT_PADDING = (TOUCH_TARGET_MIN - SMALL_PILL_VISIBLE_MIN) / 2

function buttonTextColors(tokens: ReturnType<typeof createTokensV2>, quiet: boolean): Record<ButtonVariant, string> {
  return {
    primary: tokens.fgOnPrimary,
    secondary: tokens.bg,
    ghost: quiet ? tokens.fg2 : tokens.fg1,
    destructive: tokens.fgOnBad,
    caution: tokens.fgOnOverdue,
  }
}

/** A waiting action's face is the skeleton, so its label reads `fg1` on the skeleton tone; a quiet ghost keeps `fg2`. */
function waitingTextColor(tokens: AppTokensV2, variant: ButtonVariant, quiet: boolean): string {
  return variant === 'ghost' && quiet ? tokens.fg2 : tokens.fg1
}

/** The waiting face clears the variant fill for the skeleton and keeps the ghost border width, so the size stays. */
function waitingFaceStyle(variant: ButtonVariant, ghostBorderWidth: number): ViewStyle {
  return { backgroundColor: 'transparent', borderWidth: variant === 'ghost' ? ghostBorderWidth : 0, borderColor: 'transparent' }
}

interface VariantFaceInput {
  readonly variant: ButtonVariant
  readonly tokens: AppTokensV2
  readonly pressed: boolean
  readonly hovered: boolean
  readonly elevated: boolean
  readonly quiet: boolean
  readonly ghostBorderWidth: number
  readonly brandFill: string | undefined
}

/** The variant fill of a pill at rest or pressed. A ghost also fills while the pointer is on it. A provider pill keeps its brand fill. */
function variantFaceStyle({ variant, tokens, pressed, hovered, elevated, quiet, ghostBorderWidth, brandFill }: VariantFaceInput): ViewStyle {
  if (brandFill) return { backgroundColor: brandFill }
  switch (variant) {
    case 'secondary':
      return { backgroundColor: pressed ? mixHex(tokens.fg1, tokens.bg, 0.1) : tokens.fg1 }
    case 'ghost':
      return { backgroundColor: pressed || hovered ? ghostActiveFill(tokens, elevated, quiet) : ghostRestFill(tokens, elevated), borderWidth: ghostBorderWidth, borderColor: tokens.hairlineStrong }
    case 'destructive':
      return { backgroundColor: pressed ? mixHex(tokens.statusBad, tokens.fg1, 0.15) : tokens.statusBad }
    case 'caution':
      return { backgroundColor: pressed ? mixHex(tokens.statusOverdue, '#000000', 0.15) : tokens.statusOverdue }
    default:
      return { backgroundColor: pressed ? tokens.primaryPressed : tokens.primary }
  }
}

function ghostRestFill(tokens: AppTokensV2, elevated: boolean): string {
  return elevated ? tokens.bgElev : 'transparent'
}

function ghostActiveFill(tokens: AppTokensV2, elevated: boolean, quiet: boolean): string {
  if (elevated) return tokens.bgElevHover
  return quiet ? tokens.bgHoverOpaque : tokens.bgHover
}

interface PillBoxInput {
  readonly sizeSpec: (typeof BUTTON_SIZES)[keyof typeof BUTTON_SIZES]
  readonly iconOnly: boolean | undefined
  readonly minimumHeight: number | undefined
  readonly edge: 'start' | undefined
  readonly matchedWidth: boolean
  readonly hasLeadingIcon: boolean
  readonly signIn: boolean
}

/** The box of a pill: a square for an icon-only action, else the size row's height, padding and gap. */
function pillBoxStyle({ sizeSpec, iconOnly, minimumHeight, edge, matchedWidth, hasLeadingIcon, signIn }: PillBoxInput): ViewStyle {
  if (iconOnly) return iconOnlyStyle(Math.max(minimumHeight ?? sizeSpec.height, SMALL_PILL_VISIBLE_MIN), edge)
  return {
    height: minimumHeight === undefined && !signIn ? Math.max(sizeSpec.height, SMALL_PILL_VISIBLE_MIN) : undefined,
    minHeight: Math.max(minimumHeight ?? 0, SMALL_PILL_VISIBLE_MIN),
    width: matchedWidth ? MATCHED_PILL_WIDTH : undefined,
    paddingVertical: SPACING.s4,
    paddingHorizontal: sizeSpec.paddingX,
    paddingStart: hasLeadingIcon ? sizeSpec.paddingX - 2 : sizeSpec.paddingX,
    gap: sizeSpec.gap,
  }
}

function buttonFocusStyle(variant: ButtonVariant, outlineColor: string): ViewStyle {
  return {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor,
    outlineOffset: -2,
    ...(variant === 'ghost' ? { borderColor: 'transparent' } : null),
  }
}

type NativeButtonProps = Readonly<ButtonProps & { retainLeadingIcon?: boolean } & Omit<PressableProps, 'children' | 'onFocus' | 'onBlur'> & { ref?: Ref<View>; buttonRef?: Ref<View>; accessibilityRole?: 'button' | 'link'; quiet?: boolean; borderless?: boolean; expanded?: boolean; onFocus?: () => void; onBlur?: () => void; onHoverIn?: () => void; onHoverOut?: () => void }>

export function Button(props: NativeButtonProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  return <ThemedButton {...props} tokens={createTokensV2(currentScheme, currentTheme)} themeMode={currentTheme} />
}

export function ThemedButton({
  tokens,
  themeMode = 'dark',
  buttonRef,
  ref,
  onPress,
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
  focusableWhenLoading = false,
  children,
  accessibleName,
  iconOnly,
  matchedWidth = false,
  label,
  leadingIcon,
  retainLeadingIcon = false,
  brand,
  hint,
  accessibilityRole = 'button',
  quiet = false,
  borderless = false,
  formId: _formId,
  edge,
  ...pressableProps
}: NativeButtonProps & { tokens: AppTokensV2; themeMode?: ThemeMode }) {
  const composedRef = useComposedRefs(ref, buttonRef)
  const size = useContext(ActionRowContext) ? 'sm' : requestedSize
  const sizeSpec = BUTTON_SIZES[size]
  const nativelyDisabled = disabled || (loading && !focusableWhenLoading)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const signIn = signInButtonSpec(brand)
  const appleColors = brand === 'apple' ? APPLE_SIGN_IN_BUTTON.colors[themeMode] : null
  const textColor = loading ? waitingTextColor(tokens, variant, quiet) : appleColors?.ink ?? buttonTextColors(tokens, quiet)[variant]
  const leadingGlyph = buttonLeadingGlyph(leadingIcon, textColor)

  const ghostBorderWidth = borderless ? 0 : 1.5

  return (
    <ThemedMotionPressable
      {...pressableProps}
      ref={composedRef}
      tokens={tokens}
      static={loading}
      hitSlop={size === 'sm' && (!iconOnly || (minimumHeight ?? 0) < TOUCH_TARGET_MIN) ? SMALL_PILL_HIT_PADDING : undefined}
      onPress={loading ? undefined : onPress ?? onClick}
      onFocus={() => { setFocused(true); onFocus?.() }}
      onBlur={() => { setFocused(false); onBlur?.() }}
      onHoverIn={() => { setHovered(true); onHoverIn?.() }}
      onHoverOut={() => { setHovered(false); onHoverOut?.() }}
      disabled={nativelyDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={iconOnly ? label : accessibleName}
      accessibilityHint={hint}
      accessibilityState={{ ...pressableProps.accessibilityState, disabled: nativelyDisabled, busy: loading, ...(expanded === undefined ? {} : { expanded }) }}
      testID={`button-${variant}-${size}`}
      style={({ pressed }) => [
        styles.base,
        retainLeadingIcon ? { maxWidth: '100%' } : null,
        pillBoxStyle({ sizeSpec, iconOnly, minimumHeight, edge, matchedWidth, hasLeadingIcon: Boolean(leadingIcon), signIn: signIn !== null }),
        signIn ? signInPillStyle(signIn) : null,
        loading ? waitingFaceStyle(variant, ghostBorderWidth) : variantFaceStyle({ variant, tokens, pressed: pressed && !disabled, hovered: hovered && !disabled, elevated, quiet, ghostBorderWidth, brandFill: appleColors?.fill }),
        focused ? buttonFocusStyle(variant, appleColors && !loading ? appleColors.ink : tokens.fg1) : null,
        disabled && !loading ? styles.disabled : null,
      ]}
    >
      <ButtonContents tokens={tokens} loading={loading} retainLeadingIcon={retainLeadingIcon} iconOnly={iconOnly} leadingGlyph={leadingGlyph} textColor={textColor}
        signIn={signIn} labelSize={appleColors ? APPLE_SIGN_IN_TITLE_SIZE : sizeSpec.fontSize}>{children}</ButtonContents>
    </ThemedMotionPressable>
  )
}

/** Native navigation with the same visual contract as PillButton. */
export function PillLink({ onPress, children }: Readonly<{ onPress: () => void; children: string }>) {
  return <Button accessibilityRole="link" onClick={onPress}>{children}</Button>
}

function iconOnlyStyle(side: number, edge: 'start' | undefined): ViewStyle {
  return { height: side, width: side, paddingHorizontal: SPACING.s0, gap: 0, marginStart: edge === 'start' ? ICON_ACTION_START_HANG : undefined }
}

/** A provider pill grows around a title that large text wraps and keeps its resting capsule radius, so no corner cuts the title. */
function signInPillStyle({ paddingX, paddingY, gap }: SignInButtonSpec): ViewStyle {
  return { minHeight: SIGN_IN_BUTTON_HEIGHT, borderRadius: SIGN_IN_BUTTON_HEIGHT / 2, paddingVertical: paddingY, paddingHorizontal: paddingX, paddingStart: paddingX, gap }
}

/** A provider pill holds its mark in a slot of the resting content height at the top, so a wrapped title keeps the mark on its first line. */
function ButtonLead({ signIn, children }: Readonly<{ signIn: SignInButtonSpec; children: React.ReactNode }>) {
  return <View style={{ height: SIGN_IN_BUTTON_HEIGHT - signIn.paddingY * 2, alignSelf: 'flex-start', justifyContent: 'center' }}>{children}</View>
}

/** A provider title wraps whenever it does not fit; another label with a retained icon wraps above font scale 1.3. */
function labelWrapping(signIn: SignInButtonSpec | null, retainLeadingIcon: boolean, fontScale: number) {
  if (signIn) return { numberOfLines: undefined, shrink: styles.labelShrink }
  return { numberOfLines: retainLeadingIcon && fontScale > 1.3 ? undefined : 1, shrink: retainLeadingIcon ? styles.labelShrink : null }
}

/** The face, glyph and label. A waiting action keeps its glyph and label on the skeleton face. */
function ButtonContents({ tokens, loading, retainLeadingIcon, iconOnly, leadingGlyph, children, textColor, signIn, labelSize }: Readonly<Pick<ButtonProps, 'children' | 'iconOnly'> & {
  tokens: AppTokensV2; loading: boolean; retainLeadingIcon: boolean; leadingGlyph: React.ReactNode; textColor: string; signIn: SignInButtonSpec | null; labelSize: number
}>) {
  const { fontScale } = useWindowDimensions()
  const iconColor = isValidElement<{ color?: string }>(children) ? children.props.color : undefined
  const wrapping = labelWrapping(signIn, retainLeadingIcon, fontScale)
  const lead = iconOnly ? buttonLeadingGlyph(children, iconColor ?? textColor) : leadingGlyph
  return <>
      {loading ? <SkeletonFace tokens={tokens} /> : null}
      {signIn && lead ? <ButtonLead signIn={signIn}>{lead}</ButtonLead> : lead}
      {iconOnly ? null : (
        <Text
          numberOfLines={wrapping.numberOfLines}
          style={[
            styles.label,
            wrapping.shrink,
            { color: textColor, fontSize: labelSize },
          ]}
        >
          {children}
        </Text>
      )}
  </>
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
  label: {
    fontFamily: 'Geist_500Medium',
  },
  labelShrink: {
    flexShrink: 1,
  },
})

export { Button as PillButton }

/** The pill paints its glyph in its label colour. Orbit owns its inks (the planet in the foreground, the moon in the accent), so the mascot keeps them on every variant, as on web. */
function buttonLeadingGlyph(icon: React.ReactNode, color: string) {
  if (!isValidElement<{ color?: string }>(icon) || icon.type === OrbitMascot) return icon
  return cloneElement(icon, { color })
}
