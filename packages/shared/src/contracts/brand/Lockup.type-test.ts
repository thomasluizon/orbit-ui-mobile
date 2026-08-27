import type { LockupProps } from './Lockup'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type LockupTypeContract = [
  Assert<IsExact<Record<never, never>, LockupProps>>,
  // @ts-expect-error the lockup cannot be resized
  Assert<IsExact<{ size: 28 }, LockupProps>>,
  // @ts-expect-error the lockup cannot be restyled with a class
  Assert<IsExact<{ className: 'large' }, LockupProps>>,
  // @ts-expect-error the lockup cannot be restyled inline
  Assert<IsExact<{ style: Record<never, never> }, LockupProps>>,
]
