import type { SheetProps } from './Sheet'

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

export type SheetTypeAssertions = BareSheet | OpenSheet | ClosedSheet | ToggledSheet
