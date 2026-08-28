import type { AccountDayValue, DayStripProps, HabitDayValue } from '@orbit/shared/contracts/dates'
import { Snowflake } from '@/components/ui/icons'

type StripValue = AccountDayValue | HabitDayValue

function stateWord(props: DayStripProps, state: StripValue): string {
  if (props.scope === 'habit') {
    if (state === 'not-scheduled') return props.words.notScheduled
    if (state === 'done') return props.words.done
    return props.words.missed
  }
  if (state === 'active') return props.words.active
  if (state === 'frozen') return props.words.frozen
  if (state === 'today') return props.words.today
  return props.words.missed
}

function cellStyle(state: StripValue) {
  if (state === 'done' || state === 'active') return { background: 'var(--fg-1)' }
  if (state === 'frozen') return { background: 'var(--fg-2)' }
  if (state === 'today') return { boxShadow: 'inset 0 0 0 2px var(--primary)' }
  if (state === 'not-scheduled') return { background: 'var(--bg-well)' }
  return { boxShadow: 'inset 0 0 0 1px var(--fg-4)' }
}

export function DayStrip(props: Readonly<DayStripProps>) {
  const size = props.size ?? 20
  const count = props.length === undefined ? props.days.length : Math.max(props.length, 0)
  const firstIndex = Math.max(props.days.length - count, 0)
  const days = props.days.slice(firstIndex)
  const labels = props.labels?.slice(firstIndex)

  return (
    <div role="group" aria-label={props.label} data-scope={props.scope} className="flex items-center" style={{ gap: 8 }}>
      {days.map((state, index) => {
        const cellLabel = labels?.[index] ?? String(firstIndex + index + 1)
        return (
          <span
            key={`${cellLabel}-${index}`}
            role="img"
            aria-label={`${cellLabel}, ${stateWord(props, state)}`}
            aria-current={state === 'today' ? 'date' : undefined}
            data-state={state}
            className="inline-flex shrink-0 items-center justify-center"
            style={{ width: size, height: size, borderRadius: 8, ...cellStyle(state) }}
          >
            {state === 'frozen' ? (
              <Snowflake aria-hidden="true" size={16} strokeWidth={2} color="var(--bg)" />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
