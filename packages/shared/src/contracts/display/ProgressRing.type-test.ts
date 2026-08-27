import type { ProgressRingProps } from './ProgressRing'

const acceptProgressRing = (_props: ProgressRingProps): void => undefined

acceptProgressRing({ value: 50, size: 48, label: 'Half complete' })

// @ts-expect-error the ring derives its own color
acceptProgressRing({ color: 'orange' })
// @ts-expect-error the ring has no tone axis
acceptProgressRing({ tone: 'positive' })
// @ts-expect-error the ring has no variant axis
acceptProgressRing({ variant: 'success' })
