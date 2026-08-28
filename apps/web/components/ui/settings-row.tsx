'use client'

import { ChevronRight, type Icon } from '@/components/ui/icons'
import type { ReactNode } from 'react'

/** Kit ListRow: flat row — leading icon/dot · title (+ desc) · value · trailing slot · chevron.
 *  Used for Profile nav, settings sub-screens, and stat strips. */
interface SettingsRowProps {
  label: string
  /** Secondary line under the label (Rubik 14 fg-3). */
  desc?: string
  value?: ReactNode
  valueColor?: string
  accessory?: 'chevron' | 'none'
  onClick?: () => void
  mono?: boolean
  leadingDot?: string
  /** Leading Tabler icon, rendered 22/1.8 centered in a 26px slot. */
  icon?: Icon
  /** Destructive row: title and icon render in status-bad. */
  danger?: boolean
  children?: ReactNode
  ariaLabel?: string
  divider?: boolean
}
export function SettingsRow({
  label,
  desc,
  value,
  valueColor,
  accessory = 'chevron',
  onClick,
  mono = false,
  leadingDot,
  icon: LeadingIcon,
  danger = false,
  children,
  ariaLabel,
  divider = true,
}: Readonly<SettingsRowProps>) {
  const interactive = typeof onClick === 'function'
  const RootTag = interactive ? 'button' : 'div'
  const titleColor = danger ? 'var(--status-bad)' : 'var(--fg-1)'

  return (
    <RootTag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      aria-label={ariaLabel}
      className={`w-full flex items-center bg-transparent ${interactive ? 'cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--bg-elev)] active:bg-[var(--bg-elev-pressed)]' : ''}`}
      style={{
        padding: '16px 20px',
        gap: 14,
        textAlign: 'left',
        appearance: 'none',
        border: 0,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--hairline)',
      }}
    >
      {LeadingIcon && (
        <span
          aria-hidden="true"
          className="inline-flex justify-center shrink-0"
          style={{ width: 26 }}
        >
          <LeadingIcon size={22} strokeWidth={1.8} color={titleColor} />
        </span>
      )}
      {leadingDot && (
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{ width: 8, height: 8, background: leadingDot }}
        />
      )}
      <span className="flex flex-col min-w-0 flex-1" style={{ gap: 4 }}>
        <span
          className="overflow-hidden line-clamp-2"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 18,
            fontWeight: 400,
            lineHeight: 1.25,
            color: titleColor,
            overflowWrap: 'anywhere',
          }}
        >
          {label}
        </span>
        {desc && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 400,
              lineHeight: 1.35,
              color: 'var(--fg-3)',
            }}
          >
            {desc}
          </span>
        )}
      </span>
      <span
        className="flex items-center shrink-0"
        style={{
          gap: 10,
          color: 'var(--fg-3)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
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
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
        )}
      </span>
    </RootTag>
  )
}
