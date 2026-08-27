import type { IconProps } from './Icon'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type IconTypeContract = [
  Assert<IsExact<{ name: 'home' }, IconProps>>,
  Assert<IsExact<{ name: 'home'; size: 16 }, IconProps>>,
  Assert<IsExact<{ name: 'home'; size: 20 }, IconProps>>,
  Assert<IsExact<{ name: 'home'; size: 24; label: 'Home' }, IconProps>>,
  // @ts-expect-error icon size stays on the native grid
  Assert<IsExact<{ name: 'home'; size: 18 }, IconProps>>,
  // @ts-expect-error icon size stays on the native grid
  Assert<IsExact<{ name: 'home'; size: 32 }, IconProps>>,
]
