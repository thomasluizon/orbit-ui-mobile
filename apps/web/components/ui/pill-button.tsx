'use client'

import Link, { type LinkProps } from 'next/link'
import type { CSSProperties } from 'react'
import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { Loader2 } from '@/components/ui/icons'
import { BUTTON_SIZES, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] text-[var(--fg-on-primary)]',
  secondary: 'bg-[var(--fg-1)] text-[var(--bg)]',
  ghost: 'bg-transparent text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]',
  destructive: 'bg-[var(--status-bad)] text-[var(--fg-on-bad)]',
  caution: 'bg-[var(--status-overdue)] text-[var(--fg-on-overdue)]',
}

const buttonInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'enabled:active:scale-[0.96]',
  secondary: 'enabled:hover:opacity-90 enabled:active:scale-[0.96] enabled:active:opacity-85',
  ghost: 'enabled:hover:bg-[var(--bg-card)] enabled:active:scale-[0.96]',
  destructive: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] enabled:active:scale-[0.96]',
  caution: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] enabled:active:scale-[0.96]',
}

const linkInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'hover:bg-[var(--primary-hover)] active:scale-[0.96]',
  secondary: 'hover:opacity-90 active:scale-[0.96] active:opacity-85',
  ghost: 'hover:bg-[var(--bg-card)] active:scale-[0.96]',
  destructive: 'hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] active:scale-[0.96]',
  caution: 'hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] active:scale-[0.96]',
}

const baseClasses = 'orbit-pill-action inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 font-medium disabled:cursor-not-allowed disabled:opacity-40'

function actionClasses(variant: ButtonVariant, size: ButtonSize, element: 'button' | 'link') {
  const interactionClasses = element === 'button'
    ? buttonInteractionClasses[variant]
    : linkInteractionClasses[variant]
  return [baseClasses, variantClasses[variant], interactionClasses, size === 'sm' ? 'touch-target' : undefined]
    .filter(Boolean)
    .join(' ')
}

function actionStyle(size: ButtonSize, iconOnly = false): CSSProperties {
  const sizeSpec = BUTTON_SIZES[size]
  return {
    fontFamily: 'var(--font-sans)',
    height: sizeSpec.height,
    width: iconOnly ? sizeSpec.height : undefined,
    paddingInline: iconOnly ? 0 : sizeSpec.paddingX,
    fontSize: sizeSpec.fontSize,
    gap: iconOnly ? 0 : sizeSpec.gap,
  }
}

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
  formId,
  descriptionId,
}: Readonly<ButtonProps>) {
  const sizeSpec = BUTTON_SIZES[size]

  return (
    <button
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
      className={actionClasses(variant, size, 'button')}
      style={actionStyle(size, iconOnly)}
    >
      {loading ? (
        <Loader2 size={sizeSpec.iconSize} strokeWidth={1.8} className="animate-spin orbit-essential-loading" aria-hidden="true" />
      ) : iconOnly ? children : null}
      {iconOnly ? null : <span>{children}</span>}
    </button>
  )
}

/** Native navigation with the same visual contract as PillButton. */
export function PillLink({
  href,
  variant = 'primary',
  size = 'md',
  children,
  accessibleName,
}: Readonly<{
  href: LinkProps['href']
  variant?: ButtonVariant
  size?: ButtonSize
  children: string
  accessibleName?: string
}>) {
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
