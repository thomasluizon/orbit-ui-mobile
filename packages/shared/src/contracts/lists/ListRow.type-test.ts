import type { ReactNode } from 'react'
import type { ListRowAction, ListRowProps } from './ListRow'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type ReadOnlyVariant = Extract<ListRowProps, { readOnly: true }>
type ActionVariant = Extract<ListRowProps, { readOnly?: false }>
type ExpectedBase = {
  icon?: ReactNode
  title: string
  wrapTitle?: boolean
  accessibilityLabel?: string
  description?: string
  value?: string
  trailing?: ReactNode
  danger?: boolean
  chevron?: boolean
  onClick?: () => void
  inset?: boolean
}
type ExpectedReadOnlyVariant = ExpectedBase & { readOnly: true; action?: never }
type ExpectedActionVariant = ExpectedBase & { readOnly?: false; action?: ListRowAction }

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

export type ListRowTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<Fields<ReadOnlyVariant>, Fields<ExpectedReadOnlyVariant>>>,
  Assert<IsExactWidth<Fields<ActionVariant>, Fields<ExpectedActionVariant>>>,
  Assert<IsExactWidth<ListRowAction['icon'], string>>,
  Assert<IsExactWidth<ListRowAction['label'], string>>,
  Assert<IsExactWidth<ListRowAction['onPress'], () => void>>,
  Assert<IsExactWidth<ListRowAction['danger'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['icon'], ReactNode>>,
  Assert<IsExactWidth<ListRowProps['title'], string>>,
  Assert<IsExactWidth<ListRowProps['wrapTitle'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['accessibilityLabel'], string | undefined>>,
  Assert<IsExactWidth<ListRowProps['description'], string | undefined>>,
  Assert<IsExactWidth<ListRowProps['value'], string | undefined>>,
  Assert<IsExactWidth<ListRowProps['trailing'], ReactNode>>,
  Assert<IsExactWidth<ListRowProps['danger'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['chevron'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['onClick'], (() => void) | undefined>>,
  Assert<IsExactWidth<ListRowProps['inset'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['readOnly'], boolean | undefined>>,
  Assert<IsExactWidth<ListRowProps['action'], ListRowAction | undefined>>,
]

export type ListRowTypeAssertions =
  | Value
  | ReadOnly
  | Action
  | ReadOnlyAction
  | UnlabelledAction
  | NodeValue
