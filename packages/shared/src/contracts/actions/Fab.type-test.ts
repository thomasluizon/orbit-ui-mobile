import type { FabProps } from './Fab'

const acceptFab = (_props: FabProps): void => undefined

acceptFab({ label: 'Create habit' })

// @ts-expect-error a FAB requires an accessible label
acceptFab({})
// @ts-expect-error a FAB has one visual treatment
acceptFab({ label: 'Create habit', variant: 'secondary' })
// @ts-expect-error a FAB has no tone axis
acceptFab({ label: 'Create habit', tone: 'quiet' })
// @ts-expect-error a FAB derives its own color
acceptFab({ label: 'Create habit', color: 'gray' })
