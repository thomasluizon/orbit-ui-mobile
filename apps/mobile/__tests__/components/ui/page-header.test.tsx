import { describe, expect, it, vi } from 'vitest'
import { Platform, StyleSheet, type TextStyle } from 'react-native'
import { PageHeader } from '@/components/ui/page-header'
import { press, renderNavigation } from './navigation-render'

describe('PageHeader', () => {
  it('lets iOS app labels wrap at accessibility text sizes', () => {
    const previous = Platform.OS
    Platform.OS = 'ios'
    try {
      const tree = renderNavigation(<PageHeader title="Preferências de notificações" backLabel="Voltar" onBack={vi.fn()} />)
      const heading = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
      expect(heading?.props).not.toHaveProperty('numberOfLines', 1)
      tree.unmount()
    } finally { Platform.OS = previous }
  })
  it('names the back control and exposes one start-aligned title', () => {
    const onBack = vi.fn()
    const tree = renderNavigation(<PageHeader title="About" backLabel="Back to Profile" onBack={onBack} />)
    const back = tree.hosts().find((node) => node.props.accessibilityLabel === 'Back to Profile')
    expect(back).toBeDefined()
    if (!back) throw new Error('Expected back control')
    press(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    const headings = tree.hosts().filter((node) => node.props.accessibilityRole === 'header')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.props.children).toBe('About')
    expect(StyleSheet.flatten(headings[0]?.props.style as TextStyle)).toMatchObject({ fontSize: 20 })
    tree.unmount()
  })
})
