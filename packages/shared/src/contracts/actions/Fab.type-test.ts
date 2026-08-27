import type { FabProps } from './Fab'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type FabTypeContract = [
  Assert<IsExact<{ label: 'Create habit' }, FabProps>>,
  // @ts-expect-error a FAB requires an accessible label
  Assert<IsExact<Record<never, never>, FabProps>>,
  // @ts-expect-error a FAB has one visual treatment
  Assert<IsExact<{ label: 'Create habit'; variant: 'secondary' }, FabProps>>,
  // @ts-expect-error a FAB has no tone axis
  Assert<IsExact<{ label: 'Create habit'; tone: 'quiet' }, FabProps>>,
  // @ts-expect-error a FAB derives its own color
  Assert<IsExact<{ label: 'Create habit'; color: 'gray' }, FabProps>>,
]
