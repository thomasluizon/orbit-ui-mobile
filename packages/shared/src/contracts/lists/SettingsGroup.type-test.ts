import type { ReactNode } from 'react'
import type { SettingsGroupItem, SettingsGroupProps } from './SettingsGroup'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

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

export type SettingsGroupTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<SettingsGroupItem['label'], string>>,
  Assert<IsExactWidth<SettingsGroupItem['value'], string | undefined>>,
  Assert<IsExactWidth<SettingsGroupItem['trailing'], ReactNode>>,
  Assert<IsExactWidth<SettingsGroupItem['onClick'], (() => void) | undefined>>,
  Assert<IsExactWidth<SettingsGroupProps['items'], SettingsGroupItem[]>>,
]

export type SettingsGroupTypeAssertions =
  | Valid
  | MissingLabel
  | NodeValue
  | Children
