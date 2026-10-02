'use client'

import Link, { type LinkProps } from 'next/link'
import { useContext, type CSSProperties, type Ref } from 'react'
import { ActionRowContext } from './action-row'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { Loader2 } from '@/components/ui/icons'
import { BUTTON_SIZES, MATCHED_PILL_WIDTH, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] text-[var(--fg-on-primary)]',
  secondary: 'bg-[var(--fg-1)] text-[var(--bg)]',
  ghost: 'bg-transparent text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]',
  destructive: 'bg-[var(--status-bad)] text-[var(--fg-on-bad)]',
  caution: 'bg-[var(--status-overdue)] text-[var(--fg-on-overdue)]',
}

const buttonInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'enabled:active:scale-[0.96]',
  secondary: 'enabled:hover:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))] enabled:active:scale-[0.96] enabled:active:opacity-85',
  ghost: 'overflow-hidden enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] motion-safe:enabled:active:scale-[0.96]',
  destructive: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] enabled:active:scale-[0.96]',
  caution: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] enabled:active:scale-[0.96]',
}

const linkInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'hover:bg-[var(--primary-hover)] active:scale-[0.96]',
  secondary: 'hover:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))] active:scale-[0.96] active:opacity-85',
  ghost: 'overflow-hidden hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96]',
  destructive: 'hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] active:scale-[0.96]',
  caution: 'hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] active:scale-[0.96]',
}

const baseClasses = 'orbit-pill-action inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 font-medium disabled:cursor-not-allowed'

function actionClasses(variant: ButtonVariant, size: ButtonSize, element: 'button' | 'link', loading = false, quiet = false) {
  const variantInteractions = element === 'button'
    ? buttonInteractionClasses[variant]
    : linkInteractionClasses[variant]
  const interactionClasses = quiet && variant === 'ghost'
    ? 'overflow-hidden enabled:hover:bg-[var(--bg-hover-opaque)] enabled:active:bg-[var(--bg-hover-opaque)] motion-safe:enabled:active:scale-[0.96]'
    : variantInteractions
  return [baseClasses, variantClasses[variant], interactionClasses,
    element === 'button' && !loading ? 'disabled:opacity-40' : undefined,
    size === 'sm' ? 'touch-target' : undefined]
    .filter(Boolean)
    .join(' ')
}

function inlineStartPadding(paddingX: number, iconOnly: boolean, leadingIcon: boolean): number {
  if (iconOnly) return 0
  return leadingIcon ? paddingX - 2 : paddingX
}

function actionStyle(size: ButtonSize, iconOnly = false, matchedWidth = false, leadingIcon = false): CSSProperties {
  const sizeSpec = BUTTON_SIZES[size]
  return {
    flexShrink: 0,
    fontFamily: 'var(--font-sans)',
    height: sizeSpec.height,
    width: iconOnly ? sizeSpec.height : matchedWidth ? MATCHED_PILL_WIDTH : undefined,
    paddingInlineStart: inlineStartPadding(sizeSpec.paddingX, iconOnly, leadingIcon),
    paddingInlineEnd: iconOnly ? 0 : sizeSpec.paddingX,
    fontSize: sizeSpec.fontSize,
    gap: iconOnly ? 0 : sizeSpec.gap,
  }
}

/** The canonical five-variant pill action in the shared two-size geometry. */
export function Button({
  variant = 'primary',
  size: requestedSize = 'sm',
  onClick,
  disabled = false,
  loading = false,
  children,
  accessibleName,
  iconOnly,
  matchedWidth = false,
  label,
  leadingIcon,
  formId,
  descriptionId,
  buttonRef,
  quiet = false,
}: Readonly<ButtonProps & { buttonRef?: Ref<HTMLButtonElement>; quiet?: boolean }>) {
  const size = useContext(ActionRowContext) ? 'sm' : requestedSize
  const sizeSpec = BUTTON_SIZES[size]

  return (
    <button
      ref={buttonRef}
      type={onClick ? 'button' : 'submit'}
      form={formId}
      onClick={loading ? undefined : onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? label : accessibleName}
      aria-describedby={descriptionId}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      className={actionClasses(variant, size, 'button', loading, quiet)}
      style={{ ...actionStyle(size, iconOnly, matchedWidth, Boolean(leadingIcon)), color: variant === 'ghost' && quiet ? 'var(--fg-2)' : undefined }}
    >
      {loading ? (
        <Loader2 size={sizeSpec.iconSize} strokeWidth={1.8} className="animate-spin orbit-essential-loading" aria-hidden="true" />
      ) : iconOnly ? children : leadingIcon}
      {iconOnly ? null : <span>{children}</span>}
    </button>
  )
}

/** Native navigation with the same visual contract as PillButton. */
export function PillLink({
  href,
  variant = 'primary',
  size: requestedSize = 'sm',
  children,
  accessibleName,
}: Readonly<{
  href: LinkProps['href']
  variant?: ButtonVariant
  size?: ButtonSize
  children: string
  accessibleName?: string
}>) {
  const size = useContext(ActionRowContext) ? 'sm' : requestedSize
  return (
    <Link
      href={href}
      aria-label={accessibleName}
      data-variant={variant}
      data-size={size}
      className={actionClasses(variant, size, 'link')}
      style={actionStyle(size)}
    >
      <span>{children}</span>
    </Link>
  )
}

export { Button as PillButton }
