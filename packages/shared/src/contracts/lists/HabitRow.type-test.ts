import type { HabitRowProps } from './HabitRow'

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
