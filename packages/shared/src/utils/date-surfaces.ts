import type {
  AccountDayValue,
  DayCellProps,
  DayOutcome,
  DayStripProps,
  HabitDayValue,
} from '../contracts/dates'

export function resolveDayCellOutcome({ outcome, done, scheduled }: DayCellProps): DayOutcome {
  if (outcome === 'future') return 'future'
  if (scheduled === 0) return 'not-scheduled'
  if (done !== undefined && scheduled !== undefined && scheduled > 0) {
    if (done <= 0) return 'none'
    if (done >= scheduled) return 'full'
    return 'partial'
  }
  return outcome ?? 'none'
}

export function buildDayCellAccessibleName(
  props: DayCellProps,
  outcome: DayOutcome,
  includeReadOnly = !props.loggable,
): string {
  const outcomeWord = outcome === 'not-scheduled' ? props.words.notScheduled : props.words[outcome]
  const parts = [`${props.label ?? props.day}, ${outcomeWord}`]
  if (props.done !== undefined && props.scheduled !== undefined && props.scheduled > 0) {
    parts[0] += ` ${props.done} ${props.words.of} ${props.scheduled}`
  }
  if (props.today) parts.push(props.words.today)
  if (props.selected) parts.push(props.words.selected)
  if (includeReadOnly) parts.push(props.words.readOnly)
  return parts.join(', ')
}

export function getDayStripStateWord(
  props: DayStripProps,
  state: AccountDayValue | HabitDayValue,
): string {
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
