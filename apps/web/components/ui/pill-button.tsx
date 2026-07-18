'use client'

import type { ReactNode, Ref } from 'react'
import Link from 'next/link'
import { Loader2 } from '@/components/ui/icons'
import { BUTTON_SIZES, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

interface PillButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
  /** Render the pill as a navigation `<Link>` (anchor) instead of a `<button>` — the web adapter for a CTA that navigates. Mobile mirrors this with an `onPress` router push. */
  href?: string
  disabled?: boolean
  busy?: boolean
  fullWidth?: boolean
  leading?: ReactNode
  /** Omit (with a `leading` icon + `ariaLabel`) for an icon-only square control. */
  children?: ReactNode
  className?: string
  dataTestId?: string
  /** Accessible name — required when the pill is icon-only (no visible label). */
  ariaLabel?: string
  /** Native hover tooltip, used by the collapsed sidebar rail. */
  title?: string
  /** Ref to the underlying `<button>` — for imperative focus (e.g. the tour advancing focus to Next). Ignored when `href` renders the pill as a link. */
  buttonRef?: Ref<HTMLButtonElement>
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97]',
  secondary:
    'bg-[var(--fg-1)] text-[var(--bg)] enabled:hover:opacity-90 enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97] enabled:active:opacity-85',
  ghost:
    'bg-transparent text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] enabled:hover:bg-[var(--bg-card)] enabled:active:scale-[0.97]',
  destructive:
    'bg-[var(--status-bad)] text-[var(--fg-on-bad)] enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,black)] enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97]',
}

function PillInner({
  busy,
  leading,
  iconSize,
  hasLabel,
  children,
}: Readonly<{
  busy: boolean
  leading: ReactNode
  iconSize: number
  hasLabel: boolean
  children: ReactNode
}>) {
  return (
    <>
      {busy ? (
        <Loader2 size={iconSize} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
      ) : (
        leading
      )}
      {hasLabel ? <span className={busy ? 'opacity-60' : undefined}>{children}</span> : null}
    </>
  )
}

/** Kit pill CTA in the canonical taxonomy: solid `primary`, inverted
 *  `secondary`, hairline `ghost`, or status-bad `destructive`. `size` (`sm` /
 *  `md` / `lg`) drives a fixed height + horizontal padding + label/icon scale
 *  from the shared `BUTTON_SIZES` geometry so the mobile mirror cannot drift.
 *  While `busy`, a spinner fills the leading slot, the label dims, and clicks
 *  no-op. `fullWidth` spans the phone column but caps at ~360px at the desktop
 *  breakpoint (full-bleed pills are a phone-shell affordance only). With a
 *  `leading` icon and no label child it renders an icon-only square (width =
 *  the size's height), the canonical collapsed-sidebar-rail control — pass
 *  `ariaLabel` for its accessible name. */
export function PillButton({
  variant = 'primary',
  size = 'md',
  type = 'button',
  form,
  onClick,
  href,
  disabled = false,
  busy = false,
  fullWidth = false,
  leading,
  children,
  className,
  dataTestId,
  ariaLabel,
  title,
  buttonRef,
}: Readonly<PillButtonProps>) {
  const sizeSpec = BUTTON_SIZES[size]
  const hasLabel = children != null && children !== ''
  const iconOnly = !hasLabel && leading != null
  const handleClick = busy ? undefined : onClick

  const pillClassName = [
    'inline-flex cursor-pointer items-center justify-center rounded-full border-0 font-medium no-underline transition-[background-color,opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40',
    variantClasses[variant],
    fullWidth ? 'w-full sm:w-auto sm:min-w-[220px] sm:max-w-[360px] sm:mx-auto' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const pillStyle = {
    fontFamily: 'var(--font-sans)',
    height: sizeSpec.height,
    fontSize: sizeSpec.fontSize,
    ...(iconOnly
      ? { width: sizeSpec.height, paddingInline: 0, gap: 0 }
      : { paddingInline: sizeSpec.paddingX, gap: sizeSpec.gap }),
  }

  const inner = (
    <PillInner busy={busy} leading={leading} iconSize={sizeSpec.iconSize} hasLabel={hasLabel}>
      {children}
    </PillInner>
  )

  if (href !== undefined) {
    const linkClassName = disabled ? `${pillClassName} pointer-events-none opacity-40` : pillClassName
    return (
      <Link
        href={href}
        onClick={handleClick}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        title={title}
        data-testid={dataTestId}
        tabIndex={disabled ? -1 : undefined}
        className={linkClassName}
        style={pillStyle}
      >
        {inner}
      </Link>
    )
  }

  return (
    <button
      ref={buttonRef}
      type={type}
      form={form}
      onClick={handleClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      title={title}
      data-testid={dataTestId}
      className={pillClassName}
      style={pillStyle}
    >
      {inner}
    </button>
  )
}
