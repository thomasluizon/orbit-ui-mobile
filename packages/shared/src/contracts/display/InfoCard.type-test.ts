import type { InfoCardProps } from './InfoCard'

const acceptInfoCard = (_props: InfoCardProps): void => undefined

acceptInfoCard({ icon: 'i', children: 'Details' })

// @ts-expect-error info cards have one visual treatment
acceptInfoCard({ variant: 'quiet' })
// @ts-expect-error info cards do not encode severity
acceptInfoCard({ severity: 'warning' })
// @ts-expect-error info cards do not accept tone
acceptInfoCard({ tone: 'soft' })
// @ts-expect-error info cards do not accept a stripe
acceptInfoCard({ stripe: true })
// @ts-expect-error info cards never take the accent
acceptInfoCard({ accent: true })
