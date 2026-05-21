import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/** Compact 52px app bar: back/leading icon, title (+ optional subtitle), trailing cluster. */
interface AppBarProps {
  back?: boolean
  backLabel?: string
  onBack?: () => void
  leadingIcon?: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
  hairline?: boolean
}

export function AppBar({
  back = false,
  backLabel = 'Back',
  onBack,
  leadingIcon,
  title,
  subtitle,
  trailing,
  hairline = true,
}: Readonly<AppBarProps>) {
  const leading = back ? (
    <ChevronLeft size={18} strokeWidth={1.7} color="var(--fg-2)" />
  ) : (
    leadingIcon
  )

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        minHeight: 52,
        padding: '0 12px 0 8px',
        gap: 4,
        borderBottom: hairline ? '1px solid var(--hairline)' : 'none',
      }}
    >
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="appearance-none border-0 bg-transparent cursor-pointer p-0 inline-flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          color: 'var(--fg-2)',
        }}
      >
        {leading ?? <span aria-hidden="true" style={{ width: 18, height: 18 }} />}
      </button>

      <div
        className="flex flex-col justify-center min-w-0 flex-1"
        style={{ gap: 1 }}
      >
        <div
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--fg-1)',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {trailing && (
        <div className="flex items-center shrink-0" style={{ gap: 2 }}>
          {trailing}
        </div>
      )}
    </div>
  )
}
