import type { PlanCardProps } from './PlanCard'

const acceptPlanCard = (_props: PlanCardProps): void => undefined

acceptPlanCard({ name: 'Yearly', price: '$40', badge: 'Save', selected: true })

// @ts-expect-error selected is the only visual axis
acceptPlanCard({ name: 'Yearly', price: '$40', variant: 'hero' })
// @ts-expect-error plan cards do not accept tone
acceptPlanCard({ name: 'Yearly', price: '$40', tone: 'accent' })
// @ts-expect-error plan cards do not accept color
acceptPlanCard({ name: 'Yearly', price: '$40', color: 'orange' })
// @ts-expect-error plan cards do not accept highlight
acceptPlanCard({ name: 'Yearly', price: '$40', highlight: true })
