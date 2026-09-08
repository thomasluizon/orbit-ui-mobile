import type { LockupProps } from './Lockup'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type LockupTypeContract = [
  Assert<IsExactWidth<LockupProps, Record<string, never>>>,
  Assert<IsExact<Record<never, never>, LockupProps>>,
  // @ts-expect-error the lockup cannot be resized
  Assert<IsExact<{ size: 28 }, LockupProps>>,
  // @ts-expect-error the lockup cannot be restyled with a class
  Assert<IsExact<{ className: 'large' }, LockupProps>>,
  // @ts-expect-error the lockup cannot be restyled inline
  Assert<IsExact<{ style: Record<never, never> }, LockupProps>>,
]
