'use client'

interface QuietLinkProps {
  children: React.ReactNode
  onClick?: () => void
  emphasized?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}

/** Quiet text button for reserved word-actions (skip, back, resend, change email).
 *  Small-control press scale, no glyph. Use `emphasized` for the primary quiet action. */
export function QuietLink({
  children,
  onClick,
  emphasized = false,
  disabled = false,
  type = 'button',
}: Readonly<QuietLinkProps>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex appearance-none items-center justify-center border-0 bg-transparent cursor-pointer disabled:opacity-50 transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)] enabled:active:scale-[0.96]"
      style={{
        minHeight: 44,
        padding: '6px 12px',
        fontFamily: 'var(--font-sans)',
        fontSize: emphasized ? 14 : 13,
        fontWeight: emphasized ? 500 : 400,
        color: emphasized ? 'var(--fg-2)' : 'var(--fg-3)',
      }}
    >
      {children}
    </button>
  )
}
