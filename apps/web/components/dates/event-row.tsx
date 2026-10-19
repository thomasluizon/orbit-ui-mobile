import { PersonalText } from '@/components/ui/personal-text'
import type { EventRowProps } from '@orbit/shared/contracts/dates'

export function EventRow(props: Readonly<EventRowProps>) {
  const timeLabel = props.time ?? props.allDayLabel
  const accessibleLabel = [timeLabel, props.title, props.source].filter(Boolean).join(', ')
  const content = <>
    <PersonalText style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: '1rem', lineHeight: 1.4 }}>{props.title}</PersonalText>
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span style={{ color: props.onClick ? 'var(--fg-2)' : 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>{timeLabel}</span>
        {props.source ? <PersonalText style={{ color: props.onClick ? 'var(--fg-2)' : 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.4 }}>{props.source}</PersonalText> : null}
      </div>
      {props.action}
    </div>
  </>
  const style = { gap: 4, minHeight: 68, paddingBlock: 12 }
  return props.onClick ? <button
    type="button" onClick={props.onClick} aria-label={accessibleLabel}
    data-all-day={props.time ? undefined : ''}
    className="flex min-w-0 flex-col justify-center overflow-hidden rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ ...style, paddingInline: 16, }}
  >{content}</button> : <div
    role={props.action ? 'group' : 'img'} aria-label={accessibleLabel} data-all-day={props.time ? undefined : ''}
    className="flex min-w-0 flex-col justify-center" style={style}
  >{content}</div>
}
