import type { StatusRingProps } from './StatusRing'

const acceptsStatusRing = (_props: StatusRingProps) => undefined

acceptsStatusRing({ label: 'pending' })
acceptsStatusRing({ label: 'done', status: 'done', size: 30 })

// @ts-expect-error an accessible status name is required
acceptsStatusRing({ status: 'done' })
// @ts-expect-error content cannot sit inside a status ring
acceptsStatusRing({ label: 'done', children: 'check' })
// @ts-expect-error frozen is a day-scoped state
acceptsStatusRing({ label: 'frozen', status: 'frozen' })
// @ts-expect-error skip is not a habit-row state
acceptsStatusRing({ label: 'skipped', status: 'skip' })
