import type { ButtonProps } from './Button'

const acceptButton = (_props: ButtonProps): void => undefined

acceptButton({ children: 'Continue', variant: 'primary', size: 'md' })
acceptButton({ children: 'Continue', variant: 'ghost', size: 'sm' })
acceptButton({ children: 'Continue', variant: 'secondary' })
acceptButton({ children: 'Continue', variant: 'destructive' })
acceptButton({ children: 'Continue', variant: 'caution' })
acceptButton({ children: 'icon', iconOnly: true, label: 'Back' })

// @ts-expect-error a sixth variant is not representable
acceptButton({ children: 'Continue', variant: 'accent' })
// @ts-expect-error large is outside the button scale
acceptButton({ children: 'Continue', size: 'lg' })
// @ts-expect-error extra small is outside the button scale
acceptButton({ children: 'Continue', size: 'xs' })
// @ts-expect-error icon-only buttons require an accessible name
acceptButton({ children: 'icon', iconOnly: true })
// @ts-expect-error label is reserved for icon-only buttons
acceptButton({ children: 'Continue', label: 'Continue' })
// @ts-expect-error iconOnly and label must be supplied together
acceptButton({ children: 'Continue', label: 'Continue', iconOnly: false })
