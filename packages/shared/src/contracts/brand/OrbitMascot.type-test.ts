import type { OrbitMascotProps, OrbitMascotSize } from './OrbitMascot'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type OrbitMascotTypeContract = [
  Assert<IsExactWidth<OrbitMascotSize, 16 | 20 | 24 | 48 | 96 | 128>>,
  Assert<IsExactWidth<OrbitMascotProps['state'], 'parado' | 'pensando' | 'feliz' | 'descansando' | undefined>>,
  Assert<IsExactWidth<OrbitMascotProps['still'], boolean | undefined>>,
  Assert<IsExactWidth<OrbitMascotProps['color'], string | undefined>>,
  Assert<IsExactWidth<OrbitMascotProps['lead'], boolean | undefined>>,
  Assert<IsExact<{ size: 96; state: 'feliz' }, OrbitMascotProps>>,
  // @ts-expect-error the size is required
  Assert<IsExact<{ state: 'parado' }, OrbitMascotProps>>,
  // @ts-expect-error a width off the enumerated tiers is not a mascot size
  Assert<IsExact<{ size: 40 }, OrbitMascotProps>>,
  // @ts-expect-error Orbit has no sad state
  Assert<IsExact<{ size: 48; state: 'triste' }, OrbitMascotProps>>,
]
