import type { BadgeProps } from './Badge'

const acceptBadge = (_props: BadgeProps): void => undefined

acceptBadge({ children: 'Label' })
acceptBadge({ variant: 'solid', children: 'Label' })
acceptBadge({ variant: 'outline', children: 'Label' })

// @ts-expect-error accent badges are not representable
acceptBadge({ variant: 'accent' })
// @ts-expect-error caution badges are not representable
acceptBadge({ variant: 'caution' })
// @ts-expect-error soft badges are not representable
acceptBadge({ variant: 'soft' })
// @ts-expect-error badge radius is fixed
acceptBadge({ radius: 999 })
