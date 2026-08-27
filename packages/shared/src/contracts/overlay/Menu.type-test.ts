import type { MenuProps } from './Menu'

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

export type MenuTypeAssertions =
  | ValidMenu
  | BadPresentation
  | BadAlign
  | TwoBadges
  | DestructiveMenu
  | DisabledMenu
  | WideHandler
