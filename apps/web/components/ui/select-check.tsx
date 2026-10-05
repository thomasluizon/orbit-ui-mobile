'use client'

import { useId, useState } from 'react'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { useRadioGroupItem } from '@/components/ui/radio-row'

const ROW_INDENTS = [16, 24, 32, 48, 64, 96] as const

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
        boxShadow: selected ? 'none' : 'inset 0 0 0 2px var(--radio-row-track,var(--track-empty))',
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

function RadioRowContent({ label, textMode, description, selected = false, leading, meta, tag, disabled, reason, secondaryColor, contentId, disclosed }: Readonly<Pick<RadioRowProps, 'label' | 'textMode' | 'description' | 'selected' | 'leading' | 'meta' | 'tag' | 'disabled' | 'reason'> & { secondaryColor: string; contentId: string; disclosed: boolean }>) {
  return (
    <>
      {leading ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--r-well)]">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        {textMode === 'personal' ? <PersonalText id={contentId} expanded={disabled ? disclosed : selected} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation() }} className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.4 }}>{label}</PersonalText> : <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.3 }}>{label}</span>}
        {description ? <span className="orbit-radio-row-secondary" style={{ color: secondaryColor, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
        {disabled && reason ? <span style={{ color: secondaryColor, fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4 }}>{reason}</span> : null}
      </span>
      {meta ? <span className="orbit-radio-row-secondary shrink-0" style={{ color: secondaryColor, fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {tag ? <span className="orbit-radio-row-secondary shrink-0 uppercase" style={{ color: secondaryColor, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>{tag}</span> : null}
      <RadioGlyph selected={selected} size={24} />
    </>
  )
}

function radioRowStyle(depth: number, selected: boolean, disabled: boolean) {
  return {
    gap: 12,
    minHeight: 52,
    paddingBlock: 8,
    paddingInlineStart: ROW_INDENTS[Math.min(5, Math.max(0, Math.trunc(depth)))],
    paddingInlineEnd: 16,
    background: disabled && selected ? 'rgba(var(--primary-rgb), 0.10)' : undefined,
    boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : undefined,
    borderRadius: 'var(--r-well)',
    opacity: disabled ? 0.5 : 1,
  } as const
}

export function RadioRow({ label, textMode, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const contentId = useId()
  const [disclosed, setDisclosed] = useState(false)
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled, onSelect, selected })
  const secondaryColor = selected ? 'var(--fg-2)' : 'var(--radio-row-secondary,var(--fg-3))'
  const content = <RadioRowContent label={label} textMode={textMode} description={description} selected={selected} leading={leading} meta={meta} tag={tag} disabled={disabled} reason={reason} secondaryColor={secondaryColor} contentId={contentId} disclosed={disclosed} />
  const style = radioRowStyle(depth, selected, disabled)
  const accessibilityLabel = textMode === 'personal'
    ? [label, description, meta, tag, disabled ? reason : null].filter(Boolean).join(', ')
    : undefined

  return disabled ? (
    <div className="flex min-w-0 items-center"><div role="radio" aria-label={accessibilityLabel} aria-checked={selected} aria-disabled="true" className="flex min-w-0 flex-1 items-center" style={style}>{content}</div>{textMode === 'personal' ? <button type="button" aria-label={label} aria-expanded={disclosed} aria-controls={contentId} onClick={() => setDisclosed(!disclosed)} className="orbit-hover-text flex min-h-12 min-w-12 items-center justify-center rounded-[12px] p-2 hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2"><ChevronDown aria-hidden="true" size={20} strokeWidth={2} className={disclosed ? 'rotate-180' : undefined} /></button> : null}</div>
  ) : (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-label={accessibilityLabel}
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={`orbit-radio-row flex w-full cursor-pointer items-center border-0 text-left transition-[background-color,scale] duration-[var(--dur-hover),150ms] ease-[var(--ease-standard),var(--ease-out)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${selected ? 'bg-[rgba(var(--primary-rgb),0.10)]' : 'bg-transparent'}`}
      style={style}
    >{content}</button>
  )
}
