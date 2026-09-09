import type { OrbitMarkProps } from './OrbitMark'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type OrbitMarkTypeContract = [
  Assert<IsExactWidth<OrbitMarkProps['size'], number | undefined>>,
  Assert<IsExactWidth<OrbitMarkProps['accent'], boolean | undefined>>,
  Assert<IsExact<{ size: 16; accent: true }, OrbitMarkProps>>,
  // @ts-expect-error the mark cannot be recolored
  Assert<IsExact<{ color: 'orange' }, OrbitMarkProps>>,
]
