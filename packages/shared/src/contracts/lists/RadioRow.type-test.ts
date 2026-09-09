import type { ReactNode } from 'react'
import type { RadioRowProps } from './RadioRow'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type DisabledVariant = Extract<RadioRowProps, { disabled: true }>
type EnabledVariant = Extract<RadioRowProps, { disabled?: false }>
type ExpectedBase = {
  label: string
  description?: string
  selected?: boolean
  onSelect?: () => void
  leading?: ReactNode
  depth?: number
  meta?: string
  tag?: string
}
type ExpectedDisabledVariant = ExpectedBase & { disabled: true; reason: string }
type ExpectedEnabledVariant = ExpectedBase & { disabled?: false; reason?: never }

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Enabled = Accepts<{ label: 'Top level' }, RadioRowProps>
type Disabled = Accepts<{
  label: 'Walk'
  disabled: true
  reason: 'Maximum depth reached'
}, RadioRowProps>

// @ts-expect-error a refused choice must explain why
type DisabledWithoutReason = Accepts<{ label: 'Walk'; disabled: true }, RadioRowProps>
// @ts-expect-error an enabled choice has no refusal reason
type EnabledWithReason = Accepts<{
  label: 'Walk'
  reason: 'Maximum depth reached'
}, RadioRowProps>
// @ts-expect-error dashed styling is reserved for proposed values
type Dashed = Accepts<{ label: 'Walk'; dashed: true }, RadioRowProps>

export type RadioRowTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<Fields<DisabledVariant>, Fields<ExpectedDisabledVariant>>>,
  Assert<IsExactWidth<Fields<EnabledVariant>, Fields<ExpectedEnabledVariant>>>,
  Assert<IsExactWidth<RadioRowProps['label'], string>>,
  Assert<IsExactWidth<RadioRowProps['description'], string | undefined>>,
  Assert<IsExactWidth<RadioRowProps['selected'], boolean | undefined>>,
  Assert<IsExactWidth<RadioRowProps['onSelect'], (() => void) | undefined>>,
  Assert<IsExactWidth<RadioRowProps['leading'], ReactNode>>,
  Assert<IsExactWidth<RadioRowProps['depth'], number | undefined>>,
  Assert<IsExactWidth<RadioRowProps['meta'], string | undefined>>,
  Assert<IsExactWidth<RadioRowProps['tag'], string | undefined>>,
  Assert<IsExactWidth<RadioRowProps['disabled'], boolean | undefined>>,
  Assert<IsExactWidth<RadioRowProps['reason'], string | undefined>>,
]

export type RadioRowTypeAssertions =
  | Enabled
  | Disabled
  | DisabledWithoutReason
  | EnabledWithReason
  | Dashed
