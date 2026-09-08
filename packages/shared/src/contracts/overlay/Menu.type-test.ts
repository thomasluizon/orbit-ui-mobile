import type { RefObject } from 'react'
import type {
  AnchoredMenuProps,
  AutomaticMenuProps,
  MenuItem,
  MenuProps,
  SheetMenuProps,
} from './Menu'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type ExpectedBase = {
  open?: boolean
  items?: readonly MenuItem[]
  onSelect?: (id: string) => void
  onClose?: () => void
  title?: string
  align?: 'start' | 'end'
}
type ExpectedAutomaticVariant = ExpectedBase & {
  presentation?: 'auto'
  anchorRef?: RefObject<unknown>
  wideFrom?: number
}
type ExpectedSheetVariant = ExpectedBase & {
  presentation: 'sheet'
  anchorRef?: never
  wideFrom?: never
}
type ExpectedAnchoredVariant = ExpectedBase & {
  presentation: 'anchored'
  anchorRef: RefObject<unknown>
  wideFrom?: never
}

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type ValidMenu = Accepts<{
  presentation: 'auto'
  align: 'end'
  items: [{ id: 'delete'; label: 'Delete'; badge: 'Pro'; destructive: true }]
  onSelect: (id: string) => void
}, MenuProps>

// @ts-expect-error presentation is a closed union
type BadPresentation = Accepts<{ presentation: 'popover' }, MenuProps>

// @ts-expect-error align is a closed union
type BadAlign = Accepts<{ align: 'center' }, MenuProps>

// @ts-expect-error badge is one string, not a collection
type TwoBadges = Accepts<{
  items: [{ id: 'pro'; label: 'Pro'; badge: ['Pro', 'New'] }]
}, MenuProps>

// @ts-expect-error destructive belongs to an item
type DestructiveMenu = Accepts<{ destructive: true }, MenuProps>

// @ts-expect-error disabled belongs to an item
type DisabledMenu = Accepts<{ disabled: true }, MenuProps>

// @ts-expect-error selection receives only the item id
type WideHandler = Accepts<{ onSelect: (id: string, item: unknown) => void }, MenuProps>

export type MenuTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<Fields<AutomaticMenuProps>, Fields<ExpectedAutomaticVariant>>>,
  Assert<IsExactWidth<Fields<SheetMenuProps>, Fields<ExpectedSheetVariant>>>,
  Assert<IsExactWidth<Fields<AnchoredMenuProps>, Fields<ExpectedAnchoredVariant>>>,
  Assert<IsExactWidth<MenuItem['id'], string>>,
  Assert<IsExactWidth<MenuItem['label'], string>>,
  Assert<IsExactWidth<MenuItem['icon'], string | undefined>>,
  Assert<IsExactWidth<MenuItem['destructive'], boolean | undefined>>,
  Assert<IsExactWidth<MenuItem['disabled'], boolean | undefined>>,
  Assert<IsExactWidth<MenuItem['badge'], string | undefined>>,
  Assert<IsExactWidth<MenuProps['open'], boolean | undefined>>,
  Assert<IsExactWidth<MenuProps['items'], readonly MenuItem[] | undefined>>,
  Assert<IsExactWidth<MenuProps['onSelect'], ((id: string) => void) | undefined>>,
  Assert<IsExactWidth<MenuProps['onClose'], (() => void) | undefined>>,
  Assert<IsExactWidth<MenuProps['title'], string | undefined>>,
  Assert<IsExactWidth<MenuProps['align'], 'start' | 'end' | undefined>>,
  Assert<IsExactWidth<MenuProps['presentation'], 'auto' | 'sheet' | 'anchored' | undefined>>,
  Assert<IsExactWidth<MenuProps['anchorRef'], RefObject<unknown> | undefined>>,
  Assert<IsExactWidth<MenuProps['wideFrom'], number | undefined>>,
]

export type MenuTypeAssertions =
  | ValidMenu
  | BadPresentation
  | BadAlign
  | TwoBadges
  | DestructiveMenu
  | DisabledMenu
  | WideHandler
