'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

import { resolveSettingsRowText } from '@orbit/shared/hooks'

import { ChevronRight, type Icon } from '@/components/ui/icons'
import { useId, useState, type ReactNode } from 'react'

/** Kit ListRow: flat row — leading icon/dot · title (+ desc) · value · trailing slot · chevron.
 *  Used for Profile nav, settings sub-screens, and stat strips. */
interface SettingsRowProps {
  label: string
  textMode?: 'label' | 'personal'
  /** Secondary line under the label (Geist Sans 14 fg-3). */
  desc?: string
  value?: ReactNode
  valueColor?: string
  accessory?: 'chevron' | 'none'
  onClick?: () => void
  mono?: boolean
  leadingDot?: string
  /** Leading Tabler icon, rendered 24/1.5 centered in a 28px slot. */
  icon?: Icon
  /** Destructive row: the icon uses the graphic role and the title uses the text role. */
  danger?: boolean
  children?: ReactNode
  ariaLabel?: string
  divider?: boolean
}
function SettingsRowTrailing({ value, children, accessory, valueColor, mono }: Readonly<Pick<SettingsRowProps, 'value' | 'children' | 'accessory' | 'valueColor' | 'mono'>>) {
  return <>
      {(value != null || children || accessory === 'chevron') && <span
        className="flex items-center shrink-0"
        style={{
          gap: 8,
          color: 'var(--fg-2)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: mono ? 12 : 14,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value != null && (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              color: valueColor ?? 'var(--fg-2)',
              maxWidth: 220,
            }}
          >
            {value}
          </span>
        )}
        {children}
        {accessory === 'chevron' && (
          <ChevronRight size={24} strokeWidth={1.8} color="var(--fg-3)" />
        )}
      </span>}
  </>
}

function labelPresentation(textMode: SettingsRowProps['textMode'], expanded: boolean) {
  return { className: undefined, lineHeight: textMode === 'label' || expanded ? 1.4 : 1.35, overflowWrap: textMode === 'personal' ? 'normal' as const : 'break-word' as const }
}

function settingsRowStyle(textMode: SettingsRowProps['textMode'], divider: boolean, compactControl: boolean) {
  return {
        padding: compactControl ? '0 16px' : '16px',
        minHeight: compactControl ? 52 : 48,
        alignItems: textMode === 'label' ? 'flex-start' as const : 'stretch' as const,
        flexDirection: textMode === 'personal' ? 'column' as const : 'row' as const,
        gap: 12,
        textAlign: 'left' as const,
        appearance: 'none' as const,
        border: 0,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomStyle: 'solid' as const,
        borderBottomColor: 'var(--hairline)',
  }
}

export function SettingsRow({
  label,
  textMode = 'label',
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
  const compactControl = textMode === 'label' && !!children && !desc
  const Label = textMode === 'personal' ? PersonalText : 'span'
  const [expanded, setExpanded] = useState(false)
  const labelId = useId()
  const { expandedState, controls, onAction: handleClick } = resolveSettingsRowText({ textMode, expanded, labelId, onAction: onClick, onToggle: () => setExpanded((current) => !current) })
  const interactive = typeof handleClick === 'function'
  const RootTag = interactive ? 'button' : 'div'
  const rowColors = { iconColor: danger ? 'var(--status-bad)' : 'var(--fg-1)' }
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'

  const control = (
    <RootTag
      type={interactive ? 'button' : undefined}
      onClick={handleClick}
      aria-expanded={expandedState}
      aria-controls={controls}
      aria-label={ariaLabel}
      className={`orbit-hover-text w-full flex items-center overflow-hidden rounded-[12px] bg-transparent ${interactive ? 'cursor-pointer transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]' : ''}`}
      style={settingsRowStyle(textMode, divider, compactControl)}
    >
      {LeadingIcon && (
        <span
          aria-hidden="true"
          className="inline-flex justify-center shrink-0"
          style={{ width: 28, ...(compactControl ? { minHeight: 48, alignItems: 'center' } : {}) }}
        >
          <LeadingIcon size={24} strokeWidth={1.5} color={rowColors.iconColor} />
        </span>
      )}
      {leadingDot && (
        <span
          aria-hidden="true"
          className="rounded-full shrink-0"
          style={{ width: 8, height: 8, background: leadingDot }}
        />
      )}
      <span className="flex flex-col min-w-0 flex-1" style={{ gap: 4, ...(compactControl ? { minHeight: '3rem', justifyContent: 'center' } : {}) }}>
        <Label
          expanded={textMode === 'personal' ? expanded : undefined}
          id={labelId}
          data-slot="settings-row-label"
          className={labelPresentation(textMode, expanded).className}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1.0625rem',
            fontWeight: 400,
            lineHeight: labelPresentation(textMode, expanded).lineHeight,
            color: titleColor,
            overflowWrap: labelPresentation(textMode, expanded).overflowWrap,
          }}
        >
          {label}
        </Label>
        {desc && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 400,
              lineHeight: 1.4,
              color: 'var(--fg-2)',
            }}
          >
            {desc}
          </span>
        )}
      </span>
      <SettingsRowTrailing value={value} valueColor={valueColor} accessory={accessory} mono={mono}>{children}</SettingsRowTrailing>
    </RootTag>
  )
  return textMode === 'personal' && interactive ? <PersonalTextAction label={ariaLabel ?? label} contentClassName="flex items-center w-full rounded-[12px]" contentStyle={settingsRowStyle(textMode, divider, compactControl)} control={control} /> : control
}
