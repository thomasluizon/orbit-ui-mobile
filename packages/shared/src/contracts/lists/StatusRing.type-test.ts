import type { StatusRingProps } from './StatusRing'

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Pending = Accepts<{ label: 'pending' }, StatusRingProps>
type Done = Accepts<{ label: 'done'; status: 'done'; size: 30 }, StatusRingProps>

// @ts-expect-error an accessible status name is required
type MissingLabel = Accepts<{ status: 'done' }, StatusRingProps>
// @ts-expect-error content cannot sit inside a status ring
type Children = Accepts<{ label: 'done'; children: 'check' }, StatusRingProps>
// @ts-expect-error frozen is a day-scoped state
type Frozen = Accepts<{ label: 'frozen'; status: 'frozen' }, StatusRingProps>
// @ts-expect-error skip is not a habit-row state
type Skipped = Accepts<{ label: 'skipped'; status: 'skip' }, StatusRingProps>

export type StatusRingTypeAssertions = Pending | Done | MissingLabel | Children | Frozen | Skipped
