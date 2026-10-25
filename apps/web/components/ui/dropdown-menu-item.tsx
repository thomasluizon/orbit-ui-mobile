import type { MenuItem } from '@orbit/shared/contracts/overlay'

export function ItemLabel({ item }: Readonly<{ item: MenuItem }>) {
  return <span className="orbit-menu-label">{item.label}</span>
}
