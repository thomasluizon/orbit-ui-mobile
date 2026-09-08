import type { ReactNode } from 'react'
import type { HabitRowProps } from './HabitRow'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }
type ExpectedHabitStatus = 'empty' | 'done' | 'overdue' | 'bad'

type ReplacementMenuVariant = Extract<HabitRowProps, { trailing: ReactNode; onMenu: () => void }>
type ReplacementPlainVariant = Extract<HabitRowProps, { trailing: ReactNode; onMenu?: never }>
type LogMenuVariant = Extract<HabitRowProps, { onLog: () => void; onMenu: () => void }>
type LogPlainVariant = Extract<HabitRowProps, { onLog: () => void; onMenu?: never }>
type RingMenuVariant = Extract<
  HabitRowProps,
  { statusLabel: string; onLog?: never; onMenu: () => void }
>
type RingPlainVariant = Extract<
  HabitRowProps,
  { statusLabel: string; onLog?: never; onMenu?: never }
>
type ExpectedBase = {
  icon?: string
  title: string
  meta?: string
  status?: ExpectedHabitStatus
  depth?: 0 | 1
  compact?: boolean
  onClick?: () => void
}
type ExpectedReplacement = {
  trailing: ReactNode
  statusLabel?: never
  onLog?: never
  logLabel?: never
}
type ExpectedLog = {
  trailing?: never
  statusLabel: string
  onLog: () => void
  logLabel: string
}
type ExpectedRing = {
  trailing?: never
  statusLabel: string
  onLog?: never
  logLabel?: never
}
type ExpectedMenu = { onMenu: () => void; menuLabel: string }
type ExpectedPlainMenu = { onMenu?: never; menuLabel?: never }

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Plain = Accepts<{ title: 'Walk'; statusLabel: 'pending' }, HabitRowProps>
type LogAction = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  onLog: () => void
  logLabel: 'Log Walk'
}, HabitRowProps>
type ReplacementTrailing = Accepts<{ title: 'Walk'; trailing: '2/3' }, HabitRowProps>
type MenuAction = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  onMenu: () => void
  menuLabel: 'More options'
}, HabitRowProps>

// @ts-expect-error a replacement trailing node cannot carry ring words
type TrailingWithStatus = Accepts<{
  title: 'Walk'
  trailing: '2/3'
  statusLabel: 'pending'
}, HabitRowProps>
// @ts-expect-error a replacement trailing node cannot carry a log action
type TrailingWithLog = Accepts<{ title: 'Walk'; trailing: '2/3'; onLog: () => void }, HabitRowProps>
// @ts-expect-error a replacement trailing node cannot carry a log label
type TrailingWithLogLabel = Accepts<{
  title: 'Walk'
  trailing: '2/3'
  logLabel: 'Log Walk'
}, HabitRowProps>
// @ts-expect-error a log action requires its accessible label
type LogWithoutLabel = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  onLog: () => void
}, HabitRowProps>
// @ts-expect-error a log action requires the current status name
type LogWithoutStatus = Accepts<{
  title: 'Walk'
  onLog: () => void
  logLabel: 'Log Walk'
}, HabitRowProps>
// @ts-expect-error a plain ring cannot carry a log label
type PlainWithLogLabel = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  logLabel: 'Log Walk'
}, HabitRowProps>
// @ts-expect-error a plain ring requires its current status name
type PlainWithoutStatus = Accepts<{ title: 'Walk' }, HabitRowProps>
// @ts-expect-error a menu action requires its accessible label
type MenuWithoutLabel = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  onMenu: () => void
}, HabitRowProps>
// @ts-expect-error a menu label cannot exist without a menu action
type MenuLabelWithoutAction = Accepts<{
  title: 'Walk'
  statusLabel: 'pending'
  menuLabel: 'More options'
}, HabitRowProps>
// @ts-expect-error frozen belongs to a day, not a habit row
type Frozen = Accepts<{
  title: 'Walk'
  status: 'frozen'
  statusLabel: 'frozen'
}, HabitRowProps>
// @ts-expect-error skip advances the schedule and leaves the row
type Skipped = Accepts<{
  title: 'Walk'
  status: 'skip'
  statusLabel: 'skipped'
}, HabitRowProps>
// @ts-expect-error only two inline display depths are representable
type Deep = Accepts<{ title: 'Walk'; depth: 2; statusLabel: 'pending' }, HabitRowProps>

export type HabitRowTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<Fields<ReplacementMenuVariant>, Fields<ExpectedBase & ExpectedReplacement & ExpectedMenu>>>,
  Assert<IsExactWidth<Fields<ReplacementPlainVariant>, Fields<ExpectedBase & ExpectedReplacement & ExpectedPlainMenu>>>,
  Assert<IsExactWidth<Fields<LogMenuVariant>, Fields<ExpectedBase & ExpectedLog & ExpectedMenu>>>,
  Assert<IsExactWidth<Fields<LogPlainVariant>, Fields<ExpectedBase & ExpectedLog & ExpectedPlainMenu>>>,
  Assert<IsExactWidth<Fields<RingMenuVariant>, Fields<ExpectedBase & ExpectedRing & ExpectedMenu>>>,
  Assert<IsExactWidth<Fields<RingPlainVariant>, Fields<ExpectedBase & ExpectedRing & ExpectedPlainMenu>>>,
  Assert<IsExactWidth<HabitRowProps['icon'], string | undefined>>,
  Assert<IsExactWidth<HabitRowProps['title'], string>>,
  Assert<IsExactWidth<HabitRowProps['meta'], string | undefined>>,
  Assert<IsExactWidth<HabitRowProps['status'], ExpectedHabitStatus | undefined>>,
  Assert<IsExactWidth<HabitRowProps['depth'], 0 | 1 | undefined>>,
  Assert<IsExactWidth<HabitRowProps['compact'], boolean | undefined>>,
  Assert<IsExactWidth<HabitRowProps['onClick'], (() => void) | undefined>>,
  Assert<IsExactWidth<HabitRowProps['trailing'], ReactNode>>,
  Assert<IsExactWidth<HabitRowProps['statusLabel'], string | undefined>>,
  Assert<IsExactWidth<HabitRowProps['onLog'], (() => void) | undefined>>,
  Assert<IsExactWidth<HabitRowProps['logLabel'], string | undefined>>,
  Assert<IsExactWidth<HabitRowProps['onMenu'], (() => void) | undefined>>,
  Assert<IsExactWidth<HabitRowProps['menuLabel'], string | undefined>>,
]

export type HabitRowTypeAssertions =
  | Plain
  | LogAction
  | ReplacementTrailing
  | MenuAction
  | TrailingWithStatus
  | TrailingWithLog
  | TrailingWithLogLabel
  | LogWithoutLabel
  | LogWithoutStatus
  | PlainWithLogLabel
  | PlainWithoutStatus
  | MenuWithoutLabel
  | MenuLabelWithoutAction
  | Frozen
  | Skipped
  | Deep
