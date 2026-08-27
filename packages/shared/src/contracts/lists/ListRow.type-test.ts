import type { ListRowAction, ListRowProps } from './ListRow'

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Value = Accepts<{ title: 'Reminder'; value: '08:00' }, ListRowProps>
type ReadOnly = Accepts<{ title: 'Start date'; readOnly: true }, ListRowProps>
type Action = Accepts<{
  title: 'Template'
  action: { icon: 'trash'; label: 'Delete template'; onPress: () => void }
}, ListRowProps>

// @ts-expect-error a read-only row renders no control
type ReadOnlyAction = Accepts<{
  title: 'Start date'
  readOnly: true
  action: { icon: 'trash'; label: 'Delete'; onPress: () => void }
}, ListRowProps>
// @ts-expect-error an icon action requires an accessible label
type UnlabelledAction = Accepts<{ icon: 'trash'; onPress: () => void }, ListRowAction>
// @ts-expect-error values are words, nodes belong in trailing
type NodeValue = Accepts<{ title: 'Reminder'; value: { type: 'badge' } }, ListRowProps>

export type ListRowTypeAssertions =
  | Value
  | ReadOnly
  | Action
  | ReadOnlyAction
  | UnlabelledAction
  | NodeValue
