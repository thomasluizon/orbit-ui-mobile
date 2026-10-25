import { describe, expect, it, vi } from 'vitest'
import { Platform, StyleSheet, type TextStyle } from 'react-native'
import { PageHeader } from '@/components/ui/page-header'
import { press, renderNavigation } from './navigation-render'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

describe('PageHeader', () => {
  it.each(['android', 'ios'] as const)('wraps %s titles only above font scale 1.3 and grows the header', (platform) => {
    const previous = Platform.OS
    Platform.OS = platform
    try {
      const tree = renderNavigation(<PageHeader title="Preferências de notificações" backLabel="Voltar" onBack={vi.fn()} />)
      for (const fontScale of [1, 1.3, 1.31, 2, 1]) {
        __setWindowDimensions({ width: 375, height: 812, scale: 1, fontScale })
        tree.update(<PageHeader title="Preferências de notificações" backLabel="Voltar" onBack={vi.fn()} />)
        const heading = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
        expect(heading?.props).toHaveProperty('numberOfLines', fontScale > 1.3 ? undefined : 1)
        const row = tree.hosts().find((node) => node.props.style && StyleSheet.flatten(node.props.style as TextStyle).minHeight === 60)
        if (!row) throw new Error('Expected header row')
        const rowStyle = StyleSheet.flatten(row.props.style as TextStyle)
        expect(rowStyle).toMatchObject({ minHeight: 60,
          alignItems: fontScale > 1.3 ? 'flex-start' : 'center' })
        expect(rowStyle.height).toBeUndefined()
      }
      tree.unmount()
    } finally {
      Platform.OS = previous
      __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
    }
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
