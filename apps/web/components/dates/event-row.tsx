import type { EventRowProps } from '@orbit/shared/contracts/dates'
import { CalendarDays } from '@/components/ui/icons'

export function EventRow(props: Readonly<EventRowProps>) {
  const timeLabel = props.time ?? props.allDayLabel
  const accessibleLabel = [timeLabel, props.title, props.source].filter(Boolean).join(', ')
  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      data-all-day={props.time ? undefined : ''}
      className="flex min-w-0 items-center"
      style={{ gap: 12, minHeight: 52, padding: '8px 16px', background: 'var(--bg-well)', borderRadius: 12 }}
    >
      <CalendarDays aria-hidden="true" size={20} strokeWidth={1.5} color="var(--fg-3)" />
      <span
        className="shrink-0"
        style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
      >
        {timeLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-sans)', fontSize: 16 }}>
          {props.title}
        </span>
        {props.source ? (
          <span className="block truncate" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
            {props.source}
          </span>
        ) : null}
      </span>
    </div>
  )
}
