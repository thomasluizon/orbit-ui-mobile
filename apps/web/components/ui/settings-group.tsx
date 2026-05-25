'use client'

import type { ReactNode, MouseEvent } from 'react'
import React from 'react'
import { ChevronRight } from 'lucide-react'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings card: hairline-bordered surface containing flat
 * SettingsGroupRow children, separated by inset hairlines. One elevated
 * surface per group; rows carry no chrome of their own.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const items = React.Children.toArray(children).filter(Boolean)
  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--hairline)',
        borderRadius: 12,
      }}
    >
      {items.map((child, index) => (
        <div key={index}>
          {index > 0 ? (
            <div
              aria-hidden="true"
              style={{
                height: 1,
                background: 'var(--hairline)',
                marginLeft: 16,
              }}
            />
          ) : null}
          {child}
        </div>
      ))}
    </div>
  )
}

interface SettingsGroupRowProps {
  /** Pre-rendered leading icon node. */
  icon?: ReactNode
  label: string
  /** Optional right-side hint or value text. */
  hint?: string
  /** Optional slot rendered between hint and chevron (toggle, badge). */
  trailing?: ReactNode
  /** Trailing accessory. Defaults to `'chevron'` when `onClick` is set, else `'none'`. */
  accessory?: 'chevron' | 'none'
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  proBadge?: boolean
  proBadgeLabel?: string
  ariaLabel?: string
  dataTour?: string
  dataTestId?: string
}

/** Flat row inside a SettingsGroup. Carries no divider; the group draws them. */
export function SettingsGroupRow({
  icon,
  label,
  hint,
  trailing,
  accessory,
  onClick,
  proBadge = false,
  proBadgeLabel,
  ariaLabel,
  dataTour,
  dataTestId,
}: Readonly<SettingsGroupRowProps>) {
  const resolvedAccessory = accessory ?? (onClick ? 'chevron' : 'none')

  const content = (
    <>
      <span className="flex items-center flex-1 min-w-0" style={{ gap: 12 }}>
        {icon ? (
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: 20 }}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
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
        {proBadge ? (
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-on-primary)',
              background: 'var(--primary)',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {proBadgeLabel ?? 'Pro'}
          </span>
        ) : null}
      </span>
      <span className="flex items-center shrink-0" style={{ gap: 8 }}>
        {hint ? (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              maxWidth: 200,
            }}
          >
            {hint}
          </span>
        ) : null}
        {trailing}
        {resolvedAccessory === 'chevron' ? (
          <ChevronRight size={16} strokeWidth={1.5} color="var(--fg-4)" />
        ) : null}
      </span>
    </>
  )

  const sharedStyle: React.CSSProperties = {
    padding: '14px 16px',
    gap: 12,
    minHeight: 48,
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        data-tour={dataTour}
        data-testid={dataTestId}
        className="w-full text-left flex items-center justify-between cursor-pointer transition-[background-color] duration-150 hover:bg-[var(--bg)]"
        style={{
          ...sharedStyle,
          background: 'transparent',
          appearance: 'none',
          border: 0,
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      aria-label={ariaLabel}
      data-tour={dataTour}
      data-testid={dataTestId}
      className="w-full flex items-center justify-between"
      style={sharedStyle}
    >
      {content}
    </div>
  )
}
