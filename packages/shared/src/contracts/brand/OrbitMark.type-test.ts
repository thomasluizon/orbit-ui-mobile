import type { OrbitMarkProps } from './OrbitMark'

const acceptOrbitMark = (_props: OrbitMarkProps): void => undefined

acceptOrbitMark({ size: 16, accent: true })

// @ts-expect-error the mark cannot be recolored
acceptOrbitMark({ color: 'orange' })
