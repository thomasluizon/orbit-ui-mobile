import React from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { PickerRow } from '@/components/ui/picker-row'
import { createTokensV2 } from '@/lib/theme'

const renderer = require('react-test-renderer')
const theme = vi.hoisted(() => ({ currentScheme: 'orange', currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

interface TestNode { type: unknown; props: Record<string, unknown> }

describe('proposed picker names', () => {
  it.each(['dark', 'light'] as const)('preserves proposed and interaction text contrast in %s', async (mode) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    let tree: ReturnType<typeof renderer.create>
    await renderer.act(() => { tree = renderer.create(<PickerRow proposed name="Health" selected={false} disabled={false} onToggle={vi.fn()} value="" valueStyle={{}} />) })
    const control = () => tree.root.findAll((node: TestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Health')[0]!
    const color = () => StyleSheet.flatten(tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.children === 'Health')[0]!.props.style).color
    try {
      expect(color()).toBe(tokens.fg3)
      await renderer.act(() => control().props.onPressIn())
      expect(color()).toBe(tokens.fg2)
      await renderer.act(() => control().props.onPressOut())
      expect(color()).toBe(tokens.fg3)
      await renderer.act(() => control().props.onHoverIn())
      expect(color()).toBe(tokens.fg2)
      await renderer.act(() => control().props.onHoverOut())
      expect(color()).toBe(tokens.fg3)
    } finally { await renderer.act(() => tree.unmount()) }
  })
})
