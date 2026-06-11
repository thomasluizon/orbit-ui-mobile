'use client'

import type { ReactNode } from 'react'

type PillButtonVariant = 'primary' | 'white' | 'ghost'

interface PillButtonProps {
  variant?: PillButtonVariant
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  fullWidth?: boolean
  glow?: boolean
  leading?: ReactNode
  children: ReactNode
  className?: string
}

const variantClasses: Record<PillButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--fg-on-primary)] py-[15px] enabled:hover:bg-[var(--primary-pressed)] enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98]',
  white:
    'bg-[var(--fg-1)] text-[var(--bg)] py-[14px] enabled:hover:opacity-90 enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98] enabled:active:opacity-85',
  ghost:
    'bg-transparent text-[var(--fg-1)] py-[14px] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] enabled:hover:bg-[var(--bg-card)] enabled:active:scale-[0.98]',
}

/** Kit pill CTA: glowing primary, inverted white, or hairline ghost variant. */
export function PillButton({
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  busy = false,
  fullWidth = false,
  glow = true,
  leading,
  children,
  className,
}: Readonly<PillButtonProps>) {
  const glowClasses =
    variant === 'primary' && glow && !disabled
      ? 'shadow-[var(--primary-glow)] enabled:hover:shadow-[var(--primary-glow-hover)]'
      : ''

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={[
        'inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-full border-0 px-[26px] text-[16px] font-medium transition-[background-color,opacity,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        glowClasses,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {leading}
      {children}
    </button>
  )
}
