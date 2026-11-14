'use client'

import { useComposedRefs } from '@radix-ui/react-compose-refs'

import Link, { type LinkProps } from 'next/link'
import { useContext, useId, type CSSProperties, type ComponentProps, type ReactNode, type Ref } from 'react'
import { actionClasses, actionStyle } from './pill-action-style'
import { ActionRowContext } from './action-row'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { Loader2 } from '@/components/ui/icons'
import { APPLE_SIGN_IN_TITLE_SIZE, ICON_ACTION_START_HANG, BUTTON_SIZES, SIGN_IN_BUTTON_HEIGHT, signInButtonSpec, type ButtonSize, type ButtonVariant, type SignInButtonSpec } from '@orbit/shared/theme'

function buttonDescriptionIds(descriptionId: string | undefined, hintId: string, hint: string | undefined) {
  return [descriptionId, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
}

function buttonStyle(size: ButtonSize, withinRow: boolean, { minimumHeight, iconOnly, matchedWidth, leadingIcon, brand, variant, quiet, edge }: Readonly<Pick<ButtonProps, 'minimumHeight' | 'iconOnly' | 'matchedWidth' | 'leadingIcon' | 'brand' | 'variant' | 'edge'> & { quiet: boolean }>): CSSProperties {
  const sizeSpec = BUTTON_SIZES[size]
  const signIn = signInButtonSpec(brand)
  return {
    ...actionStyle(size, iconOnly, matchedWidth, Boolean(leadingIcon), withinRow, minimumHeight),
    height: minimumHeight === undefined ? sizeSpec.height : undefined,
    minHeight: minimumHeight,
    fontSize: minimumHeight === undefined ? sizeSpec.fontSize : `${sizeSpec.fontSize / 16}rem`,
    color: variant === 'ghost' && quiet ? 'var(--fg-2)' : undefined,
    marginInlineStart: iconOnly && edge === 'start' ? ICON_ACTION_START_HANG : undefined,
    ...(signIn ? signInPillStyle(signIn, brand === 'apple' ? APPLE_SIGN_IN_TITLE_SIZE : sizeSpec.fontSize) : undefined),
    ...(brand === 'apple' ? APPLE_SIGN_IN_COLOURS : undefined),
  }
}

/**
 * A provider pill grows around a title that large text wraps: the title follows the root text size, and the
 * pill keeps its resting capsule radius, so no corner cuts the title.
 */
function signInPillStyle(signIn: SignInButtonSpec, titleSize: number): CSSProperties {
  const { paddingX, paddingY, gap } = signIn
  return {
    height: undefined,
    minHeight: SIGN_IN_BUTTON_HEIGHT,
    borderRadius: SIGN_IN_BUTTON_HEIGHT / 2,
    paddingBlock: paddingY,
    paddingInlineStart: paddingX,
    paddingInlineEnd: 'paddingEnd' in signIn ? signIn.paddingEnd : paddingX,
    gap,
    fontSize: `${titleSize / 16}rem`,
    whiteSpace: 'normal',
    textAlign: 'start',
  }
}

/** The root theme variables carry Apple's black or white pair, so every browser and the server render draw it. */
const APPLE_SIGN_IN_COLOURS: CSSProperties = {
  backgroundColor: 'var(--apple-sign-in-fill)',
  color: 'var(--apple-sign-in-ink)',
  boxShadow: 'none',
  outlineColor: 'currentColor',
}

/** A provider pill holds its mark in a slot of the resting content height at the top, so a wrapped title keeps the mark on its first line. */
function ButtonLead({ signIn, children }: Readonly<{ signIn: SignInButtonSpec | null; children: ReactNode }>) {
  if (!signIn) return children
  return <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', alignSelf: 'flex-start', height: SIGN_IN_BUTTON_HEIGHT - signIn.paddingY * 2 }}>{children}</span>
}

function ButtonIcon({ size, loading, retainLeadingIcon, iconOnly, children, leadingIcon }: Readonly<Pick<ButtonProps, 'loading' | 'iconOnly' | 'children' | 'leadingIcon'> & { size: ButtonSize; retainLeadingIcon: boolean }>) {
  if (loading && !retainLeadingIcon) return <Loader2 size={BUTTON_SIZES[size].iconSize} strokeWidth={1.8} className="animate-spin orbit-essential-loading" aria-hidden="true" />
  return iconOnly ? children : leadingIcon
}

function persistentButtonStyle(style: CSSProperties, retain: boolean): CSSProperties {
  return retain ? { ...style, maxWidth: '100%', whiteSpace: 'normal' } : style
}

function PersistentLoadingIndicator({ visible, loading, size }: Readonly<{ visible: boolean; loading: boolean; size: ButtonSize }>) {
  if (!visible) return null
  return <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, width: BUTTON_SIZES[size].iconSize, height: BUTTON_SIZES[size].iconSize }}>{loading ? <Loader2 size={BUTTON_SIZES[size].iconSize} strokeWidth={1.8} className="animate-spin orbit-essential-loading" /> : null}</span>
}

/** The canonical five-variant pill action in the shared two-size geometry. */
export function Button({
  minimumHeight,
  expanded,
  controlsId,
  hasPopup,
  elevated = false,
  variant = 'primary',
  size: requestedSize = 'sm',
  onClick,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
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
  formId,
  descriptionId,
  hint,
  buttonRef,
  ref,
  quiet = false,
  borderless = false,
  edge,
  ...buttonProps
}: Readonly<ButtonProps & { retainLeadingIcon?: boolean } & Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'onFocus' | 'onBlur' | 'onMouseEnter' | 'onMouseLeave' | 'color'> & { buttonRef?: Ref<HTMLButtonElement>; quiet?: boolean; borderless?: boolean; expanded?: boolean; controlsId?: string; hasPopup?: false | 'menu' | 'dialog'; onFocus?: () => void; onBlur?: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void }>) {
  const composedRef = useComposedRefs(ref, buttonRef)
  const withinRow = useContext(ActionRowContext)
  const hintId = useId()
  const descriptionIds = buttonDescriptionIds(descriptionId, hintId, hint)
  const size = withinRow ? 'sm' : requestedSize

  return (
    <><button
      {...buttonProps}
      ref={composedRef}
      type={buttonProps.type ?? (onClick ? 'button' : 'submit')}
      form={formId}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disabled={disabled || (loading && !focusableWhenLoading)}
      aria-disabled={!disabled && loading && focusableWhenLoading ? true : undefined}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? label : accessibleName}
      aria-describedby={descriptionIds}
      aria-haspopup={hasPopup ?? buttonProps['aria-haspopup'] ?? (expanded === undefined ? undefined : 'dialog')}
      aria-controls={controlsId ?? buttonProps['aria-controls']}
      aria-expanded={expanded ?? buttonProps['aria-expanded']}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      data-borderless={borderless || undefined}
      className={actionClasses(variant, size, 'button', loading, quiet, elevated, borderless)}
      style={persistentButtonStyle(buttonStyle(size, withinRow, { minimumHeight, iconOnly, matchedWidth, leadingIcon, brand, variant, quiet, edge }), retainLeadingIcon)}
    >
      <ButtonLead signIn={signInButtonSpec(brand)}><ButtonIcon size={size} loading={loading} retainLeadingIcon={retainLeadingIcon} iconOnly={iconOnly} leadingIcon={leadingIcon}>{children}</ButtonIcon></ButtonLead>
      {iconOnly ? null : <span>{children}</span>}
      <PersistentLoadingIndicator visible={retainLeadingIcon && !iconOnly} loading={loading} size={size} />
    </button>{hint ? <span id={hintId} hidden>{hint}</span> : null}</>
  )
}

/** Native navigation with the same visual contract as PillButton. */
export function PillLink({
  href,
  onClick,
  onNavigate,
  variant = 'primary',
  size: requestedSize = 'sm',
  children,
  accessibleName,
}: Readonly<{
  href: LinkProps['href']
  onClick?: () => void
  onNavigate?: LinkProps['onNavigate']
  variant?: ButtonVariant
  size?: ButtonSize
  children: string
  accessibleName?: string
}>) {
  const withinRow = useContext(ActionRowContext)
  const size = withinRow ? 'sm' : requestedSize
  return (
    <Link
      href={href}
      onClick={onClick}
      onNavigate={onNavigate}
      aria-label={accessibleName}
      data-variant={variant}
      data-size={size}
      className={actionClasses(variant, size, 'link')}
      style={actionStyle(size, false, false, false, withinRow)}
    >
      <span>{children}</span>
    </Link>
  )
}

export { Button as PillButton }
