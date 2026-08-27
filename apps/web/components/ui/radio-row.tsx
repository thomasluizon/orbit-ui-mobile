'use client'

import type { RadioRowProps } from '@orbit/shared/contracts/lists'

function RadioGlyph({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: 24,
        height: 24,
        background: selected ? 'var(--primary)' : 'transparent',
        boxShadow: selected ? undefined : 'inset 0 0 0 1.5px var(--hairline-strong)',
      }}
    >
      {selected ? <span className="rounded-full" style={{ width: 9, height: 9, background: 'var(--fg-on-primary)' }} /> : null}
    </span>
  )
}

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const content = (
    <>
      {leading ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--r-well)]">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.3 }}>{label}</span>
        {description ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
        {disabled && reason ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4 }}>{reason}</span> : null}
      </span>
      {meta ? <span className="shrink-0" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {tag ? <span className="shrink-0 uppercase" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>{tag}</span> : null}
      <RadioGlyph selected={selected} />
    </>
  )
  const style = {
    gap: 12,
    minHeight: 52,
    paddingBlock: 8,
    paddingInlineStart: 20 + Math.max(0, depth) * 20,
    paddingInlineEnd: 20,
    background: selected ? 'rgba(var(--primary-rgb), 0.10)' : 'transparent',
    boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : undefined,
    borderRadius: 'var(--r-well)',
    opacity: disabled ? 0.5 : 1,
  } as const

  return disabled ? (
    <div role="radio" aria-checked={selected} aria-disabled="true" className="flex items-center" style={style}>{content}</div>
  ) : (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex w-full cursor-pointer items-center border-0 text-left hover:bg-[var(--bg-elev)] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" style={style}>{content}</button>
  )
}
