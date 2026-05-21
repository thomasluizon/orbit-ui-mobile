'use client'

import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/** Flush-list row: 14px padding, label left, value/accessory right, hairline bottom.
 *  Used for Profile nav, settings sub-screens, and stat strips. */
interface SettingsRowProps {
  label: string
  value?: ReactNode
  valueColor?: string
  accessory?: 'chevron' | 'none'
  onClick?: () => void
  mono?: boolean
  leadingDot?: string
  children?: ReactNode
  href?: string
  ariaLabel?: string
}

export function SettingsRow({
  label,
  value,
  valueColor,
  accessory = 'chevron',
  onClick,
  mono = false,
  leadingDot,
  children,
  ariaLabel,
}: Readonly<SettingsRowProps>) {
  const interactive = typeof onClick === 'function'
  const RootTag = interactive ? 'button' : 'div'

  return (
    <RootTag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      aria-label={ariaLabel}
      className={`w-full flex items-center justify-between ${interactive ? 'cursor-pointer' : ''}`}
      style={{
        padding: '14px 20px',
        gap: 12,
        borderBottom: '1px solid var(--hairline)',
        background: 'transparent',
        textAlign: 'left',
        appearance: 'none',
        border: 0,
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--hairline)',
      }}
    >
      <div className="flex items-center min-w-0 flex-1" style={{ gap: 10 }}>
        {leadingDot && (
          <span
            aria-hidden="true"
            className="rounded-full shrink-0"
            style={{ width: 8, height: 8, background: leadingDot }}
          />
        )}
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--fg-1)',
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 8,
          color: 'var(--fg-3)',
          fontFamily: mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)',
          fontSize: mono ? 13 : 14,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value != null && (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              color: valueColor ?? 'var(--fg-3)',
              maxWidth: 220,
            }}
          >
            {value}
          </span>
        )}
        {children}
        {accessory === 'chevron' && (
          <ChevronRight size={16} strokeWidth={1.5} color="var(--fg-4)" />
        )}
      </div>
    </RootTag>
  )
}
