'use client'

import type { ReactNode, MouseEvent } from 'react'
import React from 'react'
import { ChevronRight } from 'lucide-react'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings list: rows sit flat on the canvas (no card surface),
 * separated by full-width hairline dividers drawn by the group.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const items = React.Children.toArray(children).filter(Boolean)
  return (
    <div>
      {items.map((child, index) => (
        <div key={index}>
          {index > 0 ? (
            <div
              aria-hidden="true"
              style={{
                height: 1,
                background: 'var(--hairline)',
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
      {icon ? (
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 26 }}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="flex flex-col flex-1 min-w-0" style={{ gap: 3 }}>
        <span className="flex items-center" style={{ gap: 6 }}>
          <span
            className={
              hint
                ? 'overflow-hidden whitespace-nowrap text-ellipsis'
                : 'min-w-0'
            }
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 18,
              fontWeight: 400,
              lineHeight: 1.25,
              color: 'var(--fg-1)',
            }}
          >
            {label}
          </span>
          {proBadge ? (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
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
        {hint ? (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              lineHeight: 1.35,
              color: 'var(--fg-3)',
            }}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <span className="flex items-center shrink-0" style={{ gap: 10 }}>
        {trailing}
        {resolvedAccessory === 'chevron' ? (
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
        ) : null}
      </span>
    </>
  )

  const sharedStyle: React.CSSProperties = {
    padding: '16px 20px',
    gap: 14,
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
        className="w-full text-left flex items-center justify-between cursor-pointer bg-transparent transition-[background-color] duration-150 ease-out hover:bg-[var(--bg-elev)]"
        style={{
          ...sharedStyle,
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
