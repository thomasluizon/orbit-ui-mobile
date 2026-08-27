import type { ProgressBarProps } from './ProgressBar'

const acceptProgressBar = (_props: ProgressBarProps): void => undefined

acceptProgressBar({ value: 5, max: 10, label: 'Half complete' })

// @ts-expect-error the bar derives its own color
acceptProgressBar({ color: 'orange' })
// @ts-expect-error the bar has no tone axis
acceptProgressBar({ tone: 'positive' })
// @ts-expect-error the bar has no variant axis
acceptProgressBar({ variant: 'success' })
