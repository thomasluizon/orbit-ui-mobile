import type { EventRowProps } from '@orbit/shared/contracts/dates'

export function EventRow(props: Readonly<EventRowProps>) {
  const timeLabel = props.time ?? props.allDayLabel
  const accessibleLabel = [timeLabel, props.title, props.source].filter(Boolean).join(', ')
  const content = <>
    <span className="line-clamp-2 [overflow-wrap:anywhere]" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: '1rem', lineHeight: 1.4 }}>{props.title}</span>
    <span style={{ color: props.onClick ? 'var(--fg-2)' : 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>{[timeLabel, props.source].filter(Boolean).join(' · ')}</span>
  </>
  const style = { gap: 4, minHeight: 68, paddingBlock: 8 }
  return props.onClick ? <button
    type="button" onClick={props.onClick} aria-label={accessibleLabel}
    data-all-day={props.time ? undefined : ''}
    className="flex min-w-0 flex-col justify-center rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ ...style, paddingInline: 8, }}
  >{content}</button> : <div
    role="img" aria-label={accessibleLabel} data-all-day={props.time ? undefined : ''}
    className="flex min-w-0 flex-col justify-center" style={style}
  >{content}</div>
}
