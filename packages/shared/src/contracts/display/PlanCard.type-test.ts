import type { PlanCardProps } from './PlanCard'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type PlanCardTypeContract = [
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; badge: 'Save'; selected: true }, PlanCardProps>>,
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; disabled: true; loading: true }, PlanCardProps>>,
  // @ts-expect-error selected is the only visual axis
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; variant: 'hero' }, PlanCardProps>>,
  // @ts-expect-error plan cards do not accept tone
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; tone: 'accent' }, PlanCardProps>>,
  // @ts-expect-error plan cards do not accept color
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; color: 'orange' }, PlanCardProps>>,
  // @ts-expect-error plan cards do not accept highlight
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; highlight: true }, PlanCardProps>>,
  // @ts-expect-error loading is boolean state
  Assert<IsExact<{ name: 'Yearly'; price: '$40'; loading: 'yes' }, PlanCardProps>>,
]
