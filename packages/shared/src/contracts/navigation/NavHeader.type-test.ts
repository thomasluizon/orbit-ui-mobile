import type { ReactNode } from 'react'
import type { NavHeaderProps } from './NavHeader'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type NavHeaderTypeContract = [
  Assert<IsExactWidth<NavHeaderProps['title'], string>>,
  Assert<IsExactWidth<NavHeaderProps['onBack'], (() => void) | undefined>>,
  Assert<IsExactWidth<NavHeaderProps['backLabel'], string | undefined>>,
  Assert<IsExactWidth<NavHeaderProps['action'], ReactNode>>,
  Assert<IsExact<{ title: 'Habit' }, NavHeaderProps>>,
  Assert<IsExact<{ title: 'Habit'; action: 'Help' }, NavHeaderProps>>,
  Assert<IsExact<{ title: 'Habit'; onBack: () => void; backLabel: 'Today' }, NavHeaderProps>>,
  Assert<IsExact<{ title: 'Habit'; onBack: () => void; backLabel: 'Today'; action: 'Help' }, NavHeaderProps>>,
  Assert<Exclude<Keys<NavHeaderProps>, 'title' | 'onBack' | 'backLabel' | 'action'> extends never ? true : false>,
  Assert<Exclude<'title' | 'onBack' | 'backLabel' | 'action', Keys<NavHeaderProps>> extends never ? true : false>,
  // @ts-expect-error back controls require the caller's words
  Assert<IsExact<{ title: 'Habit'; onBack: () => void }, NavHeaderProps>>,
  // @ts-expect-error back words require a back control
  Assert<IsExact<{ title: 'Habit'; backLabel: 'Today' }, NavHeaderProps>>,
  // @ts-expect-error headers require a title
  Assert<IsExact<{ onBack: () => void; backLabel: 'Today' }, NavHeaderProps>>,
]
