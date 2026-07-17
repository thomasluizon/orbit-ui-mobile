'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { BUTTON_SIZES, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

interface PillButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
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
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98]',
  secondary:
    'bg-[var(--fg-1)] text-[var(--bg)] enabled:hover:opacity-90 enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98] enabled:active:opacity-85',
  ghost:
    'bg-transparent text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] enabled:hover:bg-[var(--bg-card)] enabled:active:scale-[0.98]',
  destructive:
    'bg-[var(--status-bad)] text-[var(--fg-on-bad)] enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,black)] enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98]',
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
  disabled = false,
  busy = false,
  fullWidth = false,
  leading,
  children,
  className,
  dataTestId,
  ariaLabel,
  title,
}: Readonly<PillButtonProps>) {
  const sizeSpec = BUTTON_SIZES[size]
  const hasLabel = children !== undefined && children !== null && children !== ''
  const iconOnly = !hasLabel && leading != null

  return (
    <button
      type={type}
      form={form}
      onClick={busy ? undefined : onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      title={title}
      data-testid={dataTestId}
      className={[
        'inline-flex cursor-pointer items-center justify-center rounded-full border-0 font-medium transition-[background-color,opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        fullWidth ? 'w-full sm:w-auto sm:min-w-[220px] sm:max-w-[360px] sm:mx-auto' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontFamily: 'var(--font-sans)',
        height: sizeSpec.height,
        width: iconOnly ? sizeSpec.height : undefined,
        paddingInline: iconOnly ? 0 : sizeSpec.paddingX,
        fontSize: sizeSpec.fontSize,
        gap: iconOnly ? 0 : sizeSpec.gap,
      }}
    >
      {busy ? (
        <Loader2 size={sizeSpec.iconSize} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
      ) : (
        leading
      )}
      {hasLabel ? <span className={busy ? 'opacity-60' : undefined}>{children}</span> : null}
    </button>
  )
}
