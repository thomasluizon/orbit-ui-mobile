'use client'

import type { MouseEvent } from 'react'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { useTranslations } from 'next-intl'
import { useRadioGroupItem } from '@/components/ui/radio-row'

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({ selected, size }: Readonly<{ selected: boolean; size: number }>) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: selected ? 'var(--primary)' : 'transparent',
        boxShadow: selected ? 'none' : 'inset 0 0 0 2px var(--track-empty)',
      }}
    >
      {selected && (
        <span
          className="rounded-full"
          style={{
            width: Math.round(size * 0.375),
            height: Math.round(size * 0.375),
            background: 'var(--fg-on-primary)',
          }}
        />
      )}
    </span>
  )
}

/** Kit Radio: 24px circle, primary fill + white dot when selected, inset 2px empty track otherwise. */
interface SelectCheckProps {
  selected: boolean
  size?: number
  onClick?: () => void
  ariaLabel?: string
  disabled?: boolean
  habitRowControl?: boolean
}

export function SelectCheck({
  selected,
  size = 24,
  onClick,
  ariaLabel,
  disabled = false,
  habitRowControl = false,
}: Readonly<SelectCheckProps>) {
  const t = useTranslations('common')

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (disabled) return
    onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-habit-row-control={habitRowControl ? 'selection' : undefined}
      aria-label={ariaLabel ?? t('select')}
      aria-pressed={selected}
      className={`touch-target appearance-none border-0 bg-transparent p-0 shrink-0 inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.96]'}`}
      style={{ width: size, height: size }}
    >
      <RadioGlyph selected={selected} size={size} />
    </button>
  )
}

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled, onSelect, selected })
  const content = (
    <>
      {leading ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--r-well)]">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.3 }}>{label}</span>
        {description ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
        {disabled && reason ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4 }}>{reason}</span> : null}
      </span>
      {meta ? <span className="shrink-0" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {tag ? <span className="shrink-0 uppercase" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>{tag}</span> : null}
      <RadioGlyph selected={selected} size={24} />
    </>
  )
  const style = {
    gap: 12,
    minHeight: 52,
    paddingBlock: 8,
    paddingInlineStart: 20 + Math.max(0, depth) * 20,
    paddingInlineEnd: 20,
    background: disabled && selected ? 'rgba(var(--primary-rgb), 0.10)' : undefined,
    boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : undefined,
    borderRadius: 'var(--r-well)',
    opacity: disabled ? 0.5 : 1,
  } as const

  return disabled ? (
    <div role="radio" aria-checked={selected} aria-disabled="true" className="flex items-center" style={style}>{content}</div>
  ) : (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={`flex w-full cursor-pointer items-center border-0 text-left hover:bg-[var(--bg-hover)] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${selected ? 'bg-[rgba(var(--primary-rgb),0.10)]' : 'bg-transparent'}`}
      style={style}
    >{content}</button>
  )
}
