'use client'

import type { CSSProperties, ReactNode } from 'react'

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
    'bg-[var(--primary)] text-[var(--fg-on-primary)] py-[15px] enabled:hover:bg-[var(--primary-pressed)] enabled:active:bg-[var(--primary-pressed)]',
  white:
    'bg-[var(--fg-1)] text-[var(--bg)] py-[14px] enabled:hover:opacity-85 enabled:active:opacity-85',
  ghost:
    'bg-transparent text-[var(--fg-1)] py-[14px] enabled:hover:opacity-85 enabled:active:opacity-85',
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
  const shadow: CSSProperties = {}
  if (variant === 'ghost') {
    shadow.boxShadow = 'inset 0 0 0 1.5px var(--hairline-strong)'
  } else if (variant === 'primary' && glow && !disabled) {
    shadow.boxShadow = 'var(--primary-glow)'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={[
        'inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-full border-0 px-[26px] text-[16px] font-medium transition-[background-color,opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ fontFamily: 'var(--font-sans)', ...shadow }}
    >
      {leading}
      {children}
    </button>
  )
}
