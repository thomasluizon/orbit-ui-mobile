import type { MenuProps } from './Menu'

export function menuTypeTests(): void {
  const selectId = (_id: string) => {}
  const valid: MenuProps = {
    presentation: 'auto',
    align: 'end',
    items: [{ id: 'delete', label: 'Delete', badge: 'Pro', destructive: true }],
    onSelect: selectId,
  }
  // @ts-expect-error presentation is a closed union
  const badPresentation: MenuProps = { presentation: 'popover' }
  // @ts-expect-error align is a closed union
  const badAlign: MenuProps = { align: 'center' }
  // @ts-expect-error badge is one string, not a collection
  const twoBadges: MenuProps = { items: [{ id: 'pro', label: 'Pro', badge: ['Pro', 'New'] }] }
  // @ts-expect-error destructive belongs to an item
  const destructiveMenu: MenuProps = { destructive: true }
  // @ts-expect-error disabled belongs to an item
  const disabledMenu: MenuProps = { disabled: true }
  // @ts-expect-error selection receives only the item id
  const wideHandler: MenuProps = { onSelect: (_id: string, _item: unknown) => {} }
  void [valid, badPresentation, badAlign, twoBadges, destructiveMenu, disabledMenu, wideHandler]
}
