import type { TabBarProps, TabBarItem } from '../../contracts/navigation'
export type ItemKeys = AssertKeys<keyof TabBarItem, 'id' | 'label' | 'icon'>
export type ExpectedItemKeys = AssertKeys<'id' | 'label' | 'icon', keyof TabBarItem>
// @ts-expect-error an unread flag is not a tab
export const unread: TabBarItem = { id: 'today', label: 'Today', astraUnread: true }
// @ts-expect-error no additional item fields
export const extra: TabBarItem = { id: 'today', label: 'Today', extra: true }
type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof TabBarProps, 'items' | 'activeId' | 'onSelect' | 'label'>
export type ExpectedKeys = AssertKeys<'items' | 'activeId' | 'onSelect' | 'label', keyof TabBarProps>
export const valid: TabBarProps = { items: [{ id: 'today', label: 'Today' }], activeId: 'today', onSelect: () => {}, label: 'Navigation' }
// @ts-expect-error forbidden contract shape
export const forbidden0: TabBarProps = { items: [{ id: 'today' }], activeId: 'today', onSelect: () => {}, label: 'Navigation' }
// @ts-expect-error forbidden contract shape
export const forbidden1: TabBarProps = { items: [{ id: 'today', label: 'Today' }], activeId: ['today', 'profile'], onSelect: () => {}, label: 'Navigation' }
// @ts-expect-error forbidden contract shape
export const forbidden2: TabBarProps = { items: [{ id: 'today', label: 'Today' }], activeId: 'today', onSelect: () => {}, label: 'Navigation', onFab: () => {} }
// @ts-expect-error forbidden contract shape
export const forbidden3: TabBarProps = { items: [{ id: 'today', label: 'Today' }], activeId: 'today', onSelect: () => {}, label: 'Navigation', composer: () => {} }
