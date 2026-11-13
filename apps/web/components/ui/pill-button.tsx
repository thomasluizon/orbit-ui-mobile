'use client'

import { useComposedRefs } from '@radix-ui/react-compose-refs'

import Link, { type LinkProps } from 'next/link'
import { useContext, useId, type CSSProperties, type ComponentProps, type Ref } from 'react'
import { actionClasses, actionStyle } from './pill-action-style'
import { ActionRowContext } from './action-row'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { SkeletonFace } from '@/components/ui/skeleton'
import { GOOGLE_SIGN_IN_BUTTON, ICON_ACTION_START_HANG, BUTTON_SIZES, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

function buttonDescriptionIds(descriptionId: string | undefined, hintId: string, hint: string | undefined) {
  return [descriptionId, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
}

function buttonStyle(size: ButtonSize, withinRow: boolean, { minimumHeight, iconOnly, matchedWidth, leadingIcon, brand, variant, quiet, edge }: Readonly<Pick<ButtonProps, 'minimumHeight' | 'iconOnly' | 'matchedWidth' | 'leadingIcon' | 'brand' | 'variant' | 'edge'> & { quiet: boolean }>): CSSProperties {
  const sizeSpec = BUTTON_SIZES[size]
  return {
    ...actionStyle(size, iconOnly, matchedWidth, Boolean(leadingIcon), withinRow, minimumHeight),
    ...(brand === 'google' ? { paddingInlineStart: GOOGLE_SIGN_IN_BUTTON.paddingX, paddingInlineEnd: GOOGLE_SIGN_IN_BUTTON.paddingX, gap: GOOGLE_SIGN_IN_BUTTON.gap } : undefined),
    height: minimumHeight === undefined ? sizeSpec.height : undefined,
    minHeight: minimumHeight,
    fontSize: minimumHeight === undefined ? sizeSpec.fontSize : `${sizeSpec.fontSize / 16}rem`,
    color: variant === 'ghost' && quiet ? 'var(--fg-2)' : undefined,
    marginInlineStart: iconOnly && edge === 'start' ? ICON_ACTION_START_HANG : undefined,
  }
}

/** The face, glyph and label. A waiting action keeps its glyph and label on the skeleton face. */
function ButtonContent({ loading, iconOnly, children, leadingIcon }: Readonly<Pick<ButtonProps, 'loading' | 'iconOnly' | 'children' | 'leadingIcon'>>) {
  return <>
    {loading ? <SkeletonFace /> : null}
    {iconOnly ? children : leadingIcon}
    {iconOnly ? null : <span>{children}</span>}
  </>
}

function persistentButtonStyle(style: CSSProperties, retain: boolean): CSSProperties {
  return retain ? { ...style, maxWidth: '100%', whiteSpace: 'normal' } : style
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
      <ButtonContent loading={loading} iconOnly={iconOnly} leadingIcon={leadingIcon}>{children}</ButtonContent>
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
