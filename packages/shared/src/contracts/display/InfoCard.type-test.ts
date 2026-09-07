import type { ReactNode } from 'react'
import type { InfoCardProps } from './InfoCard'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type InfoCardTypeContract = [
  Assert<IsExactWidth<InfoCardProps['icon'], ReactNode>>,
  Assert<IsExactWidth<InfoCardProps['children'], ReactNode>>,
  Assert<IsExact<{ icon: 'i'; children: 'Details' }, InfoCardProps>>,
  // @ts-expect-error info cards have one visual treatment
  Assert<IsExact<{ variant: 'quiet' }, InfoCardProps>>,
  // @ts-expect-error info cards do not encode severity
  Assert<IsExact<{ severity: 'warning' }, InfoCardProps>>,
  // @ts-expect-error info cards do not accept tone
  Assert<IsExact<{ tone: 'soft' }, InfoCardProps>>,
  // @ts-expect-error info cards do not accept a stripe
  Assert<IsExact<{ stripe: true }, InfoCardProps>>,
  // @ts-expect-error info cards never take the accent
  Assert<IsExact<{ accent: true }, InfoCardProps>>,
]
