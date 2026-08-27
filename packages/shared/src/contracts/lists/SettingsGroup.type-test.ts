import type { SettingsGroupProps } from './SettingsGroup'

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Valid = Accepts<{
  items: [{ label: 'Language'; value: 'English' }]
}, SettingsGroupProps>

// @ts-expect-error every item requires its visible label
type MissingLabel = Accepts<{ items: [{ value: 'English' }] }, SettingsGroupProps>
// @ts-expect-error values are words, nodes belong in trailing
type NodeValue = Accepts<{
  items: [{ label: 'Theme'; value: { type: 'badge' } }]
}, SettingsGroupProps>
// @ts-expect-error arbitrary children cannot be inserted between rows
type Children = Accepts<{ items: []; children: 'separator' }, SettingsGroupProps>

export type SettingsGroupTypeAssertions = Valid | MissingLabel | NodeValue | Children
