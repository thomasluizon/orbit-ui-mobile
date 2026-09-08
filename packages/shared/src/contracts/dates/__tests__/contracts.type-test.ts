import type { ReactNode } from 'react'
import type {
  AccountDayStripProps,
  AccountDayWords,
  AllDayEventRowProps,
  DayCellWords,
  DayCellProps,
  DayStripProps,
  EventRowProps,
  HabitDayStripProps,
  HabitDayWords,
  LoggableDayCellProps,
  MonthGridProps,
  ReadOnlyDayCellProps,
  TimedEventRowProps,
} from '..'

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }
type ExpectedHabitDayValue = 'done' | 'missed' | 'not-scheduled'
type ExpectedAccountDayValue = 'active' | 'frozen' | 'missed' | 'today'
type ExpectedDayOutcome =
  | 'none'
  | 'partial'
  | 'full'
  | 'not-scheduled'
  | 'future'
  | 'unavailable'

type ExpectedHabitStrip = {
  scope: 'habit'
  days: ExpectedHabitDayValue[]
  words: HabitDayWords
  length?: number
  labels?: string[]
  size?: number
  label: string
}
type ExpectedAccountStrip = {
  scope: 'account'
  days: ExpectedAccountDayValue[]
  words: AccountDayWords
  length?: number
  labels?: string[]
  size?: number
  label: string
}
type ExpectedDayCellBase = {
  day: number
  done?: number
  scheduled?: number
  size?: number
  today?: boolean
  selected?: boolean
  outsideMonth?: boolean
  label?: string
  habitHistory?: boolean
  words: DayCellWords
}
type ExpectedLoggableCell = ExpectedDayCellBase & {
  loggable: true
  outcome?: Exclude<ExpectedDayOutcome, 'future' | 'unavailable'>
  onPress: () => void
}
type ExpectedReadOnlyCell = ExpectedDayCellBase & {
  loggable?: false
  outcome?: ExpectedDayOutcome
  onPress?: never
}
type ExpectedTimedEvent = {
  title: string
  source?: string
  time: string
  allDayLabel?: never
}
type ExpectedAllDayEvent = {
  title: string
  source?: string
  time?: never
  allDayLabel: string
}

type HabitWords = {
  done: 'done'
  missed: 'missed'
  notScheduled: 'not scheduled'
}
type AccountWords = {
  active: 'active'
  frozen: 'frozen'
  missed: 'missed'
  today: 'today'
}
type CellWords = {
  none: 'none'
  partial: 'partial'
  full: 'full'
  notScheduled: 'not scheduled'
  future: 'future'
  of: 'of'
  today: 'today'
  selected: 'selected'
  readOnly: 'read only'
}

type HabitStrip = Accepts<
  { scope: 'habit'; days: ['done']; words: HabitWords; label: 'history' },
  DayStripProps
>
type AccountStrip = Accepts<
  { scope: 'account'; days: ['today']; words: AccountWords; label: 'streak' },
  DayStripProps
>
// @ts-expect-error frozen belongs to the account strip
type HabitFrozen = Accepts<{ scope: 'habit'; days: ['frozen']; words: HabitWords; label: 'history' }, DayStripProps>
// @ts-expect-error not-scheduled belongs to the habit strip
type AccountNotScheduled = Accepts<{ scope: 'account'; days: ['not-scheduled']; words: AccountWords; label: 'streak' }, DayStripProps>
// @ts-expect-error habit scope requires habit words
type HabitWithAccountWords = Accepts<{ scope: 'habit'; days: ['done']; words: AccountDayWords; label: 'history' }, DayStripProps>
// @ts-expect-error account scope requires account words
type AccountWithHabitWords = Accepts<{ scope: 'account'; days: ['active']; words: HabitDayWords; label: 'streak' }, DayStripProps>
// @ts-expect-error words are required
type StripWithoutWords = Accepts<{ scope: 'habit'; days: ['done']; label: 'history' }, DayStripProps>
// @ts-expect-error label is required
type StripWithoutLabel = Accepts<{ scope: 'habit'; days: ['done']; words: HabitWords }, DayStripProps>

type LoggableCell = Accepts<
  { day: 12; loggable: true; words: CellWords; scheduled: 4; done: 1; onPress: () => void },
  DayCellProps
>
type ZeroScheduleCell = Accepts<
  { day: 12; scheduled: 0; words: CellWords },
  DayCellProps
>
// @ts-expect-error a loggable cell requires its handler
type LoggableWithoutHandler = Accepts<{ day: 12; loggable: true; words: CellWords }, DayCellProps>
// @ts-expect-error a read-only cell rejects a handler
type ReadOnlyWithHandler = Accepts<{ day: 12; loggable: false; words: CellWords; onPress: () => void }, DayCellProps>
// @ts-expect-error a future cell is never loggable
type LoggableFuture = Accepts<{ day: 12; loggable: true; outcome: 'future'; words: CellWords; onPress: () => void }, DayCellProps>
// @ts-expect-error skipped is not a day outcome
type SkippedCell = Accepts<{ day: 12; outcome: 'skipped'; words: CellWords }, DayCellProps>
// @ts-expect-error words are required
type CellWithoutWords = Accepts<{ day: 12 }, DayCellProps>
// @ts-expect-error every cell word is required
type CellWithMissingWord = Accepts<{ day: 12; words: Omit<CellWords, 'future'> }, DayCellProps>

type EmptyHeaderGrid = Accepts<{ weekdayLabels: []; children: 'day' }, MonthGridProps>
// @ts-expect-error outcomes belong to DayCell
type GridWithOutcome = Accepts<{ outcome: 'full' }, MonthGridProps>
// @ts-expect-error counts belong to DayCell
type GridWithDayCount = Accepts<{ dayCount: 31 }, MonthGridProps>
// @ts-expect-error logging belongs to DayCell
type GridWithLoggable = Accepts<{ loggable: true }, MonthGridProps>
// @ts-expect-error locale belongs to the caller
type GridWithLocale = Accepts<{ locale: 'en' }, MonthGridProps>
// @ts-expect-error weekday names arrive through weekdayLabels
type GridWithWeekdayName = Accepts<{ weekdayName: 'Monday' }, MonthGridProps>
// @ts-expect-error the grid is not interactive
type GridWithOnPress = Accepts<{ onPress: () => void }, MonthGridProps>
// @ts-expect-error the grid does not select days
type GridWithOnSelect = Accepts<{ onSelect: () => void }, MonthGridProps>
// @ts-expect-error day presses belong to DayCell
type GridWithOnDayPress = Accepts<{ onDayPress: () => void }, MonthGridProps>

type TimedEvent = Accepts<{ title: 'Standup'; source: 'Work'; time: '09:00' }, EventRowProps>
type AllDayEvent = Accepts<
  { title: 'Holiday'; source: 'Work'; allDayLabel: 'all day' },
  EventRowProps
>
// @ts-expect-error a timed event cannot also be all day
type TimedAllDayEvent = Accepts<{ title: 'Standup'; time: '09:00'; allDayLabel: 'all day' }, EventRowProps>
// @ts-expect-error an event must be timed or carry the caller's all-day words
type EventWithoutTime = Accepts<{ title: 'Holiday' }, EventRowProps>
// @ts-expect-error external events have no status ring
type EventWithStatus = Accepts<{ title: 'Standup'; time: '09:00'; status: 'done' }, EventRowProps>
// @ts-expect-error external events cannot be logged
type EventWithOnLog = Accepts<{ title: 'Standup'; time: '09:00'; onLog: () => void }, EventRowProps>
// @ts-expect-error external events have no menu
type EventWithOnMenu = Accepts<{ title: 'Standup'; time: '09:00'; onMenu: () => void }, EventRowProps>
// @ts-expect-error external events are read only
type EventWithOnClick = Accepts<{ title: 'Standup'; time: '09:00'; onClick: () => void }, EventRowProps>

export type DateContractTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<HabitDayStripProps, ExpectedHabitStrip>>,
  Assert<IsExactWidth<AccountDayStripProps, ExpectedAccountStrip>>,
  Assert<IsExactWidth<Fields<LoggableDayCellProps>, Fields<ExpectedLoggableCell>>>,
  Assert<IsExactWidth<Fields<ReadOnlyDayCellProps>, Fields<ExpectedReadOnlyCell>>>,
  Assert<IsExactWidth<TimedEventRowProps, ExpectedTimedEvent>>,
  Assert<IsExactWidth<AllDayEventRowProps, ExpectedAllDayEvent>>,
  Assert<IsExactWidth<HabitDayWords['done'], string>>,
  Assert<IsExactWidth<HabitDayWords['missed'], string>>,
  Assert<IsExactWidth<HabitDayWords['notScheduled'], string>>,
  Assert<IsExactWidth<AccountDayWords['active'], string>>,
  Assert<IsExactWidth<AccountDayWords['frozen'], string>>,
  Assert<IsExactWidth<AccountDayWords['missed'], string>>,
  Assert<IsExactWidth<AccountDayWords['today'], string>>,
  Assert<IsExactWidth<DayStripProps['scope'], 'habit' | 'account'>>,
  Assert<IsExactWidth<DayStripProps['days'], ExpectedHabitDayValue[] | ExpectedAccountDayValue[]>>,
  Assert<IsExactWidth<DayStripProps['words'], HabitDayWords | AccountDayWords>>,
  Assert<IsExactWidth<DayStripProps['length'], number | undefined>>,
  Assert<IsExactWidth<DayStripProps['labels'], string[] | undefined>>,
  Assert<IsExactWidth<DayStripProps['size'], number | undefined>>,
  Assert<IsExactWidth<DayStripProps['label'], string>>,
  Assert<IsExactWidth<DayCellWords['none'], string>>,
  Assert<IsExactWidth<DayCellWords['partial'], string>>,
  Assert<IsExactWidth<DayCellWords['full'], string>>,
  Assert<IsExactWidth<DayCellWords['notScheduled'], string>>,
  Assert<IsExactWidth<DayCellWords['unavailable'], string | undefined>>,
  Assert<IsExactWidth<DayCellWords['future'], string>>,
  Assert<IsExactWidth<DayCellWords['of'], string>>,
  Assert<IsExactWidth<DayCellWords['today'], string>>,
  Assert<IsExactWidth<DayCellWords['selected'], string>>,
  Assert<IsExactWidth<DayCellWords['readOnly'], string>>,
  Assert<IsExactWidth<DayCellProps['day'], number>>,
  Assert<IsExactWidth<DayCellProps['done'], number | undefined>>,
  Assert<IsExactWidth<DayCellProps['scheduled'], number | undefined>>,
  Assert<IsExactWidth<DayCellProps['size'], number | undefined>>,
  Assert<IsExactWidth<DayCellProps['today'], boolean | undefined>>,
  Assert<IsExactWidth<DayCellProps['selected'], boolean | undefined>>,
  Assert<IsExactWidth<DayCellProps['outsideMonth'], boolean | undefined>>,
  Assert<IsExactWidth<DayCellProps['label'], string | undefined>>,
  Assert<IsExactWidth<DayCellProps['habitHistory'], boolean | undefined>>,
  Assert<IsExactWidth<DayCellProps['words'], DayCellWords>>,
  Assert<IsExactWidth<DayCellProps['loggable'], boolean | undefined>>,
  Assert<IsExactWidth<DayCellProps['outcome'], ExpectedDayOutcome | undefined>>,
  Assert<IsExactWidth<DayCellProps['onPress'], (() => void) | undefined>>,
  Assert<IsExactWidth<MonthGridProps['weekdayLabels'], string[] | undefined>>,
  Assert<IsExactWidth<MonthGridProps['children'], ReactNode>>,
  Assert<IsExactWidth<MonthGridProps['gap'], string | number | undefined>>,
  Assert<IsExactWidth<MonthGridProps['label'], string | undefined>>,
  Assert<IsExactWidth<EventRowProps['title'], string>>,
  Assert<IsExactWidth<EventRowProps['source'], string | undefined>>,
  Assert<IsExactWidth<EventRowProps['time'], string | undefined>>,
  Assert<IsExactWidth<EventRowProps['allDayLabel'], string | undefined>>,
]

export type DateContractTypeAssertions =
  | HabitStrip
  | AccountStrip
  | HabitFrozen
  | AccountNotScheduled
  | HabitWithAccountWords
  | AccountWithHabitWords
  | StripWithoutWords
  | StripWithoutLabel
  | LoggableCell
  | ZeroScheduleCell
  | LoggableWithoutHandler
  | ReadOnlyWithHandler
  | LoggableFuture
  | SkippedCell
  | CellWithoutWords
  | CellWithMissingWord
  | EmptyHeaderGrid
  | GridWithOutcome
  | GridWithDayCount
  | GridWithLoggable
  | GridWithLocale
  | GridWithWeekdayName
  | GridWithOnPress
  | GridWithOnSelect
  | GridWithOnDayPress
  | TimedEvent
  | AllDayEvent
  | TimedAllDayEvent
  | EventWithoutTime
  | EventWithStatus
  | EventWithOnLog
  | EventWithOnMenu
  | EventWithOnClick
