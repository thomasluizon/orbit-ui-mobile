import { expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { Sun, Moon } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/lib/use-app-theme', async () => {
  const { useState } = await import('react')
  return { useAppTheme: () => {
    const [currentTheme, setTheme] = useState<'dark' | 'light'>('dark')
    return { currentScheme: 'orange', currentTheme, toggleTheme: () => setTheme(value => value === 'dark' ? 'light' : 'dark') }
  } }
})
const renderer = require('react-test-renderer')

it('flips the header theme action and target glyph on every press with shared icon geometry', () => {
  let tree!: ReturnType<typeof renderer.create>
  renderer.act(() => { tree = renderer.create(<RootNotificationHeader />) })
  try {
    const button = tree.root.findByType('Pressable')
    const paint = (pressed = false) => StyleSheet.flatten(button.props.style({ pressed }))
    expect(button.props.accessibilityLabel).toBe('settings.theme.switchToLight')
    expect(tree.root.findAllByType(Sun)).toHaveLength(1)
    expect(tree.root.findAllByType(Moon)).toHaveLength(0)
    expect(paint()).toMatchObject({ width: 44, height: 44, borderWidth: 0, backgroundColor: 'transparent' })
    expect(button.props.hitSlop).toBe(2)
    expect(paint().width + 2 * button.props.hitSlop).toBe(48)
    expect(paint(true).backgroundColor).toBe(createTokensV2('orange', 'dark').bgHover)
    renderer.act(() => button.props.onPress())
    expect(button.props.accessibilityLabel).toBe('settings.theme.switchToDark')
    expect(tree.root.findAllByType(Moon)).toHaveLength(1)
    expect(tree.root.findAllByType(Sun)).toHaveLength(0)
    renderer.act(() => button.props.onPress())
    expect(button.props.accessibilityLabel).toBe('settings.theme.switchToLight')
    expect(tree.root.findAllByType(Sun)).toHaveLength(1)
  } finally { renderer.act(() => tree.unmount()) }
})
