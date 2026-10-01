import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { createTokensV2 } from '@/lib/theme'
import { press, renderNavigation } from '../ui/navigation-render'

const theme = vi.hoisted((): { currentScheme: 'purple'; currentTheme: 'dark' | 'light' } => ({
  currentScheme: 'purple',
  currentTheme: 'dark',
}))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))

const items = [{ id: 'today', label: 'Hoje' }, { id: 'calendar', label: 'Calendário' }, { id: 'progress', label: 'Progresso' }, { id: 'profile', label: 'Perfil' }]

function getTabLabelStyle(tab: { props: { children?: unknown }; parent?: { props: { children?: unknown } } }, pressed: boolean): unknown {
  const renderContent = tab.parent?.props.children
  if (typeof renderContent !== 'function') throw new Error('Tab content does not use Pressable state')
  const content: unknown = renderContent({ pressed })
  if (!isValidElement<{ children?: ReactNode }>(content)) {
    throw new Error('Tab content does not return an element')
  }
  const label = Children.toArray(content.props.children).find(
    (node): node is ReactElement<{ style?: unknown }> => isValidElement(node) && node.type === Text,
  )
  if (!label) throw new Error('Tab content does not include its label')
  return label.props.style
}

describe('BottomTabBar', () => {
  it('renders caller words, one current tab and controlled selection without icons', () => {
    const onSelect = vi.fn()
    const tree = renderNavigation(<BottomTabBar items={items} activeId="calendar" onSelect={onSelect} label="Navigation" />)
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    expect(tabs.map((node) => node.props.accessibilityLabel)).toEqual(items.map((item) => item.label))
    expect(tabs.filter((node) => node.props.accessibilityState?.selected)).toEqual([tabs[1]])
    press(tabs[2]!)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('progress')
    onSelect.mockClear()
    press(tabs[1]!)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('calendar')
    expect(tabs[1]!.props.accessibilityState?.selected).toBe(true)
    tree.unmount()
  })

  it('keeps destinations within the large-screen content column', () => {
    const tree = renderNavigation(<BottomTabBar items={items} activeId="today" onSelect={vi.fn()} label="Navigation" />)
    const destinations = tree.hosts().find((node) => node.props.testID === 'bottom-tab-destinations')
    expect(StyleSheet.flatten(destinations?.props.style)).toMatchObject({
      alignSelf: 'center',
      maxWidth: 740,
      width: '100%',
    })
    tree.unmount()
  })

  it('paints a pressed tab on its rounded, clipped hit area', () => {
    const renderer = require('react-test-renderer')
    type TabTree = { root: { findAllByType: (type: typeof Pressable) => { props: { testID?: string; style: (state: { pressed: boolean }) => unknown } }[] }; unmount: () => void }
    let tree!: TabTree
    renderer.act(() => { tree = renderer.create(<BottomTabBar items={items} activeId="today" onSelect={vi.fn()} label="Navigation" />) })
    const tab = tree.root.findAllByType(Pressable).find((node) => node.props.testID === 'tab-progress-inactive')
    if (!tab) throw new Error('Progress tab was not rendered')
    const pressed = StyleSheet.flatten(tab.props.style({ pressed: true }))
    expect(pressed).toMatchObject({ borderRadius: 999, overflow: 'hidden', backgroundColor: createTokensV2('purple', 'dark').bgHover })
    renderer.act(() => tree.unmount())
  })

  it.each(['dark', 'light'] as const)('uses resting and pressed label roles in %s mode', (mode) => {
    theme.currentTheme = mode
    const tokens = createTokensV2(theme.currentScheme, mode)
    const tree = renderNavigation(
      <BottomTabBar
        items={items}
        activeId="calendar"
        onSelect={vi.fn()}
        label="Navigation"
      />,
    )
    const tabs = tree.hosts().filter((node) => node.props.accessibilityRole === 'tab')
    const [inactiveTab, activeTab] = tabs
    if (!inactiveTab || !activeTab) throw new Error('Bottom tabs were not rendered')

    expect(StyleSheet.flatten(getTabLabelStyle(inactiveTab, false))).toMatchObject({ color: tokens.fg3 })
    expect(StyleSheet.flatten(getTabLabelStyle(inactiveTab, true))).toMatchObject({ color: tokens.fg3 })
    expect(StyleSheet.flatten(getTabLabelStyle(activeTab, false))).toMatchObject({ color: tokens.primarySoft })
    expect(StyleSheet.flatten(getTabLabelStyle(activeTab, true))).toMatchObject({ color: tokens.primaryText })
    tree.unmount()
  })
})
