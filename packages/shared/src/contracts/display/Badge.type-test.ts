import type { ReactNode } from 'react'
import type { BadgeProps } from './Badge'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type BadgeTypeContract = [
  Assert<IsExactWidth<BadgeProps['variant'], 'solid' | 'outline' | undefined>>,
  Assert<IsExactWidth<BadgeProps['children'], ReactNode>>,
  Assert<IsExact<{ children: 'Label' }, BadgeProps>>,
  Assert<IsExact<{ variant: 'solid'; children: 'Label' }, BadgeProps>>,
  Assert<IsExact<{ variant: 'outline'; children: 'Label' }, BadgeProps>>,
  // @ts-expect-error accent badges are not representable
  Assert<IsExact<{ variant: 'accent' }, BadgeProps>>,
  // @ts-expect-error caution badges are not representable
  Assert<IsExact<{ variant: 'caution' }, BadgeProps>>,
  // @ts-expect-error soft badges are not representable
  Assert<IsExact<{ variant: 'soft' }, BadgeProps>>,
  // @ts-expect-error badge radius is fixed
  Assert<IsExact<{ radius: 999 }, BadgeProps>>,
]
