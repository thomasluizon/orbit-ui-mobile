import type { IconProps } from './Icon'

const acceptIcon = (_props: IconProps): void => undefined

acceptIcon({ name: 'home' })
acceptIcon({ name: 'home', size: 16 })
acceptIcon({ name: 'home', size: 20 })
acceptIcon({ name: 'home', size: 24, label: 'Home' })

// @ts-expect-error icon size stays on the native grid
acceptIcon({ name: 'home', size: 18 })
// @ts-expect-error icon size stays on the native grid
acceptIcon({ name: 'home', size: 32 })
