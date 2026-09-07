import type { ReactNode } from 'react'
import type { TabBarItem, TabBarProps } from './TabBar'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

type Item = { id: 'today'; label: 'Today' }
type Props = { items: readonly [Item]; activeId: 'today'; onSelect: (id: string) => void; label: 'Navigation' }

export type TabBarTypeContract = [
  Assert<IsExactWidth<TabBarItem['id'], string>>,
  Assert<IsExactWidth<TabBarItem['label'], string>>,
  Assert<IsExactWidth<TabBarItem['icon'], ((state: { active: boolean }) => ReactNode) | undefined>>,
  Assert<IsExactWidth<TabBarProps['items'], readonly TabBarItem[]>>,
  Assert<IsExactWidth<TabBarProps['activeId'], string>>,
  Assert<IsExactWidth<TabBarProps['onSelect'], (id: string) => void>>,
  Assert<IsExactWidth<TabBarProps['label'], string>>,
  Assert<IsExact<Item, TabBarItem>>,
  Assert<IsExact<Item & { icon: (state: { active: boolean }) => null }, TabBarItem>>,
  Assert<IsExact<Props, TabBarProps>>,
  Assert<Exclude<Keys<TabBarItem>, 'id' | 'label' | 'icon'> extends never ? true : false>,
  Assert<Exclude<'id' | 'label' | 'icon', Keys<TabBarItem>> extends never ? true : false>,
  Assert<Exclude<Keys<TabBarProps>, 'items' | 'activeId' | 'onSelect' | 'label'> extends never ? true : false>,
  Assert<Exclude<'items' | 'activeId' | 'onSelect' | 'label', Keys<TabBarProps>> extends never ? true : false>,
  // @ts-expect-error item words belong to the caller
  Assert<IsExact<Item & { labelKey: 'nav.today' }, TabBarItem>>,
  // @ts-expect-error unread state does not belong to a destination
  Assert<IsExact<Item & { astraUnread: true }, TabBarItem>>,
  // @ts-expect-error the tab bar holds no centre create control
  Assert<IsExact<Props & { showFab: true }, TabBarProps>>,
  // @ts-expect-error create handlers belong to the shell
  Assert<IsExact<Props & { onCreate: () => void }, TabBarProps>>,
  // @ts-expect-error floating action handlers belong to the shell
  Assert<IsExact<Props & { onFab: () => void }, TabBarProps>>,
  // @ts-expect-error the composer belongs to the shell
  Assert<IsExact<Props & { composer: 'Create' }, TabBarProps>>,
  // @ts-expect-error the tab bar requires an accessible group name
  Assert<IsExact<Omit<Props, 'label'>, TabBarProps>>,
  // @ts-expect-error destinations require the caller's words
  Assert<IsExact<Omit<Item, 'label'>, TabBarItem>>,
  // @ts-expect-error two current destinations are not representable
  Assert<IsExact<Omit<Props, 'activeId'> & { activeId: readonly ['today', 'profile'] }, TabBarProps>>,
]
