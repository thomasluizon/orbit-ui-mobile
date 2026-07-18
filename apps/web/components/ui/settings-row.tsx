'use client'

import { ChevronRight, type LucideIcon } from '@/components/ui/icons'
import type { ReactNode } from 'react'

/** Kit ListRow: flat row — leading icon/dot · title (+ desc) · value · trailing slot · chevron.
 *  Used for Profile nav, settings sub-screens, and stat strips. Draws no rule of its own;
 *  wrap rows in `SettingsGroup` when adjacent rows earn a hairline between them. */
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
  /** Leading lucide icon, rendered 22/1.8 centered in a 26px slot. */
  icon?: LucideIcon
  /** Destructive row: title and icon render in status-bad. */
  danger?: boolean
  children?: ReactNode
  ariaLabel?: string
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
        gap: 12,
        textAlign: 'left',
        appearance: 'none',
        border: 0,
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
          gap: 8,
          color: 'var(--fg-3)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: mono ? 13 : 14,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value != null && (
          <span
            className="overflow-hidden line-clamp-2 text-right"
            style={{
              color: valueColor ?? 'var(--fg-3)',
              maxWidth: 220,
              overflowWrap: 'anywhere',
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

interface SwitchProps {
  on: boolean
  onToggle: () => void
  ariaLabel: string
  disabled?: boolean
}

/** Kit Switch: 48×28 pill, 22px thumb; primary track when on, fg-1 alpha track when off. */
export function Switch({ on, onToggle, ariaLabel, disabled = false }: Readonly<SwitchProps>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="appearance-none border-0 bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 p-0 shrink-0 inline-flex items-center justify-center"
      style={{ minHeight: 44 }}
    >
      <span
        className="inline-flex items-center"
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          padding: 3,
          background: on
            ? 'var(--primary)'
            : 'color-mix(in srgb, var(--fg-1) 16%, transparent)',
          transition: 'background-color var(--dur-base) var(--ease-standard)',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: 'var(--fg-on-primary)',
            boxShadow: '0 1px 2px rgba(0,0,0,.20)',
            transform: on ? 'translateX(20px)' : 'translateX(0px)',
            transition: 'transform var(--dur-base) var(--ease-standard)',
          }}
        />
      </span>
    </button>
  )
}
