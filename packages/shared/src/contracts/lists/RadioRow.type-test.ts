import type { RadioRowProps } from './RadioRow'

const acceptsRadioRow = (_props: RadioRowProps) => undefined

acceptsRadioRow({ label: 'Top level' })
acceptsRadioRow({ label: 'Walk', disabled: true, reason: 'Maximum depth reached' })

// @ts-expect-error a refused choice must explain why
acceptsRadioRow({ label: 'Walk', disabled: true })
// @ts-expect-error an enabled choice has no refusal reason
acceptsRadioRow({ label: 'Walk', reason: 'Maximum depth reached' })
// @ts-expect-error dashed styling is reserved for proposed values
acceptsRadioRow({ label: 'Walk', dashed: true })
