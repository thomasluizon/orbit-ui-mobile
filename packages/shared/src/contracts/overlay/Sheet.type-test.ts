import type { ReactNode } from 'react'
import type { SheetProps } from './Sheet'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type BareSheet = Accepts<Record<never, never>, SheetProps>
type OpenSheet = Accepts<{ open: true }, SheetProps>

// @ts-expect-error false means the sheet should be unmounted
type ClosedSheet = Accepts<{ open: false }, SheetProps>

// @ts-expect-error a dynamic boolean permits a kept and toggled sheet
type ToggledSheet = Accepts<{ open: boolean }, SheetProps>

export type SheetTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<SheetProps['open'], true | undefined>>,
  Assert<IsExactWidth<SheetProps['title'], string | undefined>>,
  Assert<IsExactWidth<SheetProps['headerAccessory'], ReactNode>>,
  Assert<IsExactWidth<SheetProps['actions'], ReactNode>>,
  Assert<IsExactWidth<SheetProps['onClose'], (() => void) | undefined>>,
  Assert<IsExactWidth<SheetProps['children'], ReactNode>>,
]

export type SheetTypeAssertions =
  | BareSheet
  | OpenSheet
  | ClosedSheet
  | ToggledSheet
