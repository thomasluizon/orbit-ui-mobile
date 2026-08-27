import type { ProgressRingProps } from './ProgressRing'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type ProgressRingTypeContract = [
  Assert<IsExact<{ value: 50; size: 48; label: 'Half complete' }, ProgressRingProps>>,
  // @ts-expect-error the ring derives its own color
  Assert<IsExact<{ color: 'orange' }, ProgressRingProps>>,
  // @ts-expect-error the ring has no tone axis
  Assert<IsExact<{ tone: 'positive' }, ProgressRingProps>>,
  // @ts-expect-error the ring has no variant axis
  Assert<IsExact<{ variant: 'success' }, ProgressRingProps>>,
]
