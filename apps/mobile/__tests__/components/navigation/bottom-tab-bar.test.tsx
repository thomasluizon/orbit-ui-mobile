import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { createTokensV2 } from '@/lib/theme'
import { press, renderNavigation } from '../ui/navigation-render'

const theme = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({
  currentScheme: 'orange',
  currentTheme: 'dark',
}))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))

const items = [{ id: 'today', label: 'Hoje' }, { id: 'calendar', label: 'Calendário' }, { id: 'progress', label: 'Progresso' }, { id: 'profile', label: 'Perfil' }]

function getTabChildStyle(tab: { props: { children?: unknown }; parent?: { props: { children?: unknown } } }, pressed: boolean, childType: typeof Text | typeof View = Text): unknown {
  const renderContent = tab.parent?.props.children
  if (typeof renderContent !== 'function') throw new Error('Tab content does not use Pressable state')
  const content: unknown = renderContent({ pressed })
  if (!isValidElement<{ children?: ReactNode }>(content)) {
    throw new Error('Tab content does not return an element')
  }
  const label = Children.toArray(content.props.children).find(
    (node): node is ReactElement<{ style?: unknown }> => isValidElement(node) && node.type === childType,
  )
  if (!label) throw new Error('Tab content does not include its label')
  return label.props.style
}

describe('BottomTabBar', () => {
  it.each(['light', 'dark'].flatMap((mode) => [false, true].map((icons) => ({ mode: mode as 'light' | 'dark', icons }))))('measures selected tab hover and press-only text in $mode with icons=$icons', async ({ mode, icons }) => {
    theme.currentTheme = mode
    const tokens = createTokensV2(theme.currentScheme, mode)
    const onSelect = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<BottomTabBar items={items.map((item) => ({ ...item, icon: icons ? () => <View /> : undefined }))} activeId="today" onSelect={onSelect} label="Navigation" />) })
    const tab = () => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'tab-today-current')[0]!
    const measure = () => {
      const label = tab().findAll((node) => String(node.type) === 'Text')[0]!
      const color = StyleSheet.flatten(label.props.style as StyleProp<TextStyle>).color as string
      const destinations = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'bottom-tab-destinations')[0]!
      const backgrounds = [destinations, tab(), label].flatMap((node) => {
        const fill = StyleSheet.flatten<ViewStyle>(node.props.style ?? {}).backgroundColor
        return typeof fill === 'string' ? [fill] : []
      })
      return { color, backgrounds }
    }
    try {
      const resting = measure()
      const bounds = StyleSheet.flatten(tab().props.style as StyleProp<ViewStyle>)
      expect(resting.color).toBe(tokens.primarySoft)
      expect(contrastOnSurface(resting.color, resting.backgrounds)).toBeGreaterThanOrEqual(4.5)
      await act(() => { (tab().props.onHoverIn as () => void)() })
      const hovered = measure()
      expect(hovered.color).toBe(resting.color)
      expect(hovered.backgrounds).toEqual([tokens.bg])
      expect(contrastOnSurface(hovered.color, hovered.backgrounds)).toBeGreaterThanOrEqual(4.5)
      await act(() => { (tab().props.onPressIn as () => void)() })
      expect(measure()).toEqual(hovered)
      await act(() => { (tab().props.onHoverOut as () => void)() })
      const pressed = measure()
      expect(pressed.color).toBe(resting.color)
      expect(pressed.backgrounds).toEqual([tokens.bg])
      expect(contrastOnSurface(pressed.color, pressed.backgrounds)).toBeGreaterThanOrEqual(4.5)
      if (icons) {
        const indicator = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'tab-indicator-today')[0]!
        expect(StyleSheet.flatten(indicator.props.style as StyleProp<ViewStyle>).backgroundColor).toBe(tokens.bgHover)
      }
      expect(StyleSheet.flatten(tab().props.style as StyleProp<ViewStyle>)).toEqual(bounds)
      expect(tab().props.accessibilityState).toEqual({ selected: true })
      expect(onSelect).not.toHaveBeenCalled()
      await act(() => { (tab().props.onPressOut as () => void)() })
      expect(measure()).toEqual(resting)
      await act(() => { (tab().props.onPress as () => void)() })
      expect(onSelect).toHaveBeenCalledExactlyOnceWith('today')
      expect(tab().props.accessibilityState).toEqual({ selected: true })
    } finally { await act(() => { tree.update(<></>) }) }
  })

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

  it('keeps the press fill on the icon indicator with room below the hairline', () => {
    const tree = renderNavigation(<BottomTabBar items={items.map((item) => ({ ...item, icon: () => <Text>Icon</Text> }))} activeId="today" onSelect={vi.fn()} label="Navigation" />)
    const destinations = tree.hosts().find((node) => node.props.testID === 'bottom-tab-destinations')
    expect(StyleSheet.flatten(destinations?.props.style)).toMatchObject({ minHeight: 80 })
    const tab = tree.hosts().find((node) => node.props.testID === 'tab-progress-inactive')
    expect(StyleSheet.flatten(tab?.props.style)).not.toHaveProperty('backgroundColor')
    const indicator = tree.hosts().find((node) => node.props.testID === 'tab-indicator-progress')
    expect(StyleSheet.flatten(indicator?.props.style)).toMatchObject({ width: 56, height: 32 })
    if (!tab) throw new Error('Progress tab was not rendered')
    expect(StyleSheet.flatten(getTabChildStyle(tab, false, View))).not.toHaveProperty('backgroundColor')
    expect(StyleSheet.flatten(getTabChildStyle(tab, true, View))).toMatchObject({ backgroundColor: createTokensV2('orange', theme.currentTheme).bgHover })
    tree.unmount()
  })

  it.each((['dark', 'light'] as const).flatMap((mode) => [true, false].map((active) => ({ mode, active }))))('fills only the indicator on pointer hover in $mode, active=$active', ({ mode, active }) => {
    theme.currentTheme = mode
    const tokens = createTokensV2(theme.currentScheme, mode)
    const tree = renderNavigation(<BottomTabBar items={items.map((item) => ({ ...item, icon: () => <Text>Icon</Text> }))} activeId={active ? "progress" : "today"} onSelect={vi.fn()} label="Navigation" />)
    const tab = () => tree.hosts().find((node) => node.props.testID === `tab-progress-${active ? "current" : "inactive"}`)!
    const hoverTab = tab() as { props: { onHoverIn?: () => void; onHoverOut?: () => void } }
    expect(hoverTab.props.onHoverIn).toBeTypeOf('function')
    const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
    void renderer.act(() => hoverTab.props.onHoverIn?.())
    expect(StyleSheet.flatten(tab().props.style)).not.toHaveProperty('backgroundColor')
    expect(StyleSheet.flatten(getTabChildStyle(tab(), false))).toMatchObject({ color: active ? tokens.primarySoft : tokens.fg3 })
    const indicator = tree.hosts().find((node) => node.props.testID === 'tab-indicator-progress')!
    expect(StyleSheet.flatten(indicator.props.style)).toMatchObject({ width: 56, height: 32, borderRadius: 999, backgroundColor: tokens.bgHover })
    expect(StyleSheet.flatten(getTabChildStyle(tab(), true, View))).toMatchObject({ backgroundColor: tokens.bgHover })
    expect(StyleSheet.flatten(getTabChildStyle(tab(), true))).toMatchObject({ color: active ? tokens.primarySoft : tokens.fg3 })
    void renderer.act(() => hoverTab.props.onHoverOut?.())
    expect(StyleSheet.flatten(tab().props.style)).not.toHaveProperty('backgroundColor')
    tree.unmount()
  })

  it.each([true, false])('keeps the light tab colour role under hover and press, active=%s', (active) => {
    theme.currentTheme = 'light'
    const tokens = createTokensV2(theme.currentScheme, 'light')
    const tree = renderNavigation(<BottomTabBar items={items} activeId={active ? 'today' : 'calendar'} onSelect={vi.fn()} label="Navigation" />)
    const tab = () => tree.hosts().find((node) => node.props.testID === `tab-today-${active ? 'current' : 'inactive'}`)!
    const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
    const pointer = tab() as { props: { onHoverIn?: () => void; onHoverOut?: () => void } }
    expect(pointer.props.onHoverIn).toBeTypeOf('function')
    void renderer.act(() => pointer.props.onHoverIn?.())
    for (const pressed of [false, true]) {
      expect(StyleSheet.flatten(getTabChildStyle(tab(), pressed))).toMatchObject({ color: active ? tokens.primarySoft : tokens.fg3 })
    }
    void renderer.act(() => pointer.props.onHoverOut?.())
    expect(StyleSheet.flatten(getTabChildStyle(tab(), false))).toMatchObject({ color: active ? tokens.primarySoft : tokens.fg3 })
    tree.unmount()
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

    expect(StyleSheet.flatten(getTabChildStyle(inactiveTab, false))).toMatchObject({ color: tokens.fg3 })
    expect(StyleSheet.flatten(getTabChildStyle(inactiveTab, true))).toMatchObject({ color: tokens.fg3 })
    expect(StyleSheet.flatten(getTabChildStyle(activeTab, false))).toMatchObject({ color: tokens.primarySoft })
    expect(StyleSheet.flatten(getTabChildStyle(activeTab, true))).toMatchObject({ color: tokens.primarySoft })
    tree.unmount()
  })
})
