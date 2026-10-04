'use client'

import { resolveSettingsRowText } from '@orbit/shared/hooks'

import type { ReactNode, MouseEvent } from 'react'
import React, { useId, useState } from 'react'
import { ChevronRight } from '@/components/ui/icons'

const SETTINGS_ROW_STYLE: React.CSSProperties = {
  padding: '16px',
  gap: 12,
  minHeight: 48,
}

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings list: rows sit flat on the canvas (no card surface),
 * separated by full-width hairline dividers drawn by the group.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const items = React.Children.toArray(children).filter(React.isValidElement)
  return (
    <div>
      {items.map((child, index) => (
        <div key={child.key}>
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
  textMode?: 'label' | 'personal'
  /** Optional right-side hint or value text. */
  hint?: string
  /** Optional slot rendered between hint and chevron (toggle, badge). */
  trailing?: ReactNode
  /** Trailing accessory. Defaults to `'chevron'` when `onClick` is set, else `'none'`. */
  accessory?: 'chevron' | 'none'
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  ariaLabel?: string
  dataTestId?: string
}

function SettingsGroupRowContent({ icon, label, textMode, hint, trailing, resolvedAccessory, expanded, labelId }: Readonly<Pick<SettingsGroupRowProps, 'icon' | 'label' | 'textMode' | 'hint' | 'trailing'> & { resolvedAccessory: 'chevron' | 'none'; expanded: boolean; labelId: string }>) {
  return (
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
      <span className="flex flex-col flex-1 min-w-0" style={{ gap: 4 }}>
        <span className="flex items-center">
          <span
            id={labelId}
            data-slot="settings-row-label"
            className={textMode === 'personal' && !expanded ? 'min-w-0 line-clamp-2' : 'min-w-0'}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '1.0625rem',
              fontWeight: 400,
              lineHeight: textMode === 'label' || expanded ? 1.4 : 1.35,
              color: 'var(--fg-1)',
              overflowWrap: textMode === 'personal' ? 'anywhere' : 'break-word',
            }}
          >
            {label}
          </span>
        </span>
        {hint ? (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              lineHeight: 1.35,
              color: 'var(--fg-2)',
            }}
          >
            {hint}
          </span>
        ) : null}
      </span>
      {(trailing || resolvedAccessory === 'chevron') ? <span className="flex items-center shrink-0" style={{ gap: 8 }}>
        {trailing}
        {resolvedAccessory === 'chevron' ? (
          <ChevronRight size={24} strokeWidth={1.8} color="var(--fg-3)" />
        ) : null}
      </span> : null}
    </>
  )
}

/** Flat row inside a SettingsGroup. Carries no divider; the group draws them. */
export function SettingsGroupRow({
  icon,
  label,
  textMode = 'label',
  hint,
  trailing,
  accessory,
  onClick,
  ariaLabel,
  dataTestId,
}: Readonly<SettingsGroupRowProps>) {
  const [expanded, setExpanded] = useState(false)
  const labelId = useId()
  const { expandedState, controls, onAction: handleClick } = resolveSettingsRowText({ textMode, expanded, labelId, onAction: onClick, onToggle: () => setExpanded((current) => !current) })
  const resolvedAccessory = accessory ?? (onClick ? 'chevron' : 'none')

  const content = <SettingsGroupRowContent icon={icon} label={label} textMode={textMode} hint={hint} trailing={trailing} resolvedAccessory={resolvedAccessory} expanded={expanded} labelId={labelId} />

  if (handleClick) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={expandedState}
        aria-controls={controls}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        className="w-full text-left flex items-center justify-between cursor-pointer rounded-[12px] bg-transparent transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
        style={{
          ...SETTINGS_ROW_STYLE,
          alignItems: textMode === 'label' ? 'flex-start' : 'stretch',
          flexDirection: textMode === 'personal' ? 'column' : 'row',
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
      data-testid={dataTestId}
      className="w-full flex items-center justify-between"
      style={{ ...SETTINGS_ROW_STYLE, alignItems: 'flex-start' }}
    >
      {content}
    </div>
  )
}
