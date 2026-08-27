import type { RadioRowProps } from './RadioRow'

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

export type RadioRowTypeAssertions =
  | Enabled
  | Disabled
  | DisabledWithoutReason
  | EnabledWithReason
  | Dashed
