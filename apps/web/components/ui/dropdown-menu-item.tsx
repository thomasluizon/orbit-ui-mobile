import type { MenuItem } from '@orbit/shared/contracts/overlay'

export function ItemLabel({ item }: Readonly<{ item: MenuItem }>) {
  return item.icon === 'astra' ? null : <span className="orbit-menu-label">{item.label}</span>
}
