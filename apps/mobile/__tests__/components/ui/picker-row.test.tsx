import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { PickerRow } from '@/components/ui/picker-row'
import { createTokensV2 } from '@/lib/theme'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (load) => ({ ...await load<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))

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

it.each([false, true])('keeps toggle selection and honors reduced motion=%s', async (reduced) => {
  motion.reduced = reduced
  theme.currentTheme = 'dark'
  const onToggle = vi.fn()
  let tree: ReturnType<typeof renderer.create>
  await renderer.act(() => { tree = renderer.create(<PickerRow name="Health" selected disabled={false} onToggle={onToggle} value="3" valueStyle={{}} />) })
  try {
    const control = tree.root.findAll((node: TestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')[0]!
    expect(control.props.accessibilityState).toMatchObject({ selected: true })
    const resolveStyle = control.props.style as (state: { pressed: boolean }) => ViewStyle[]
    expect(StyleSheet.flatten(resolveStyle({ pressed: true }))).toMatchObject({ backgroundColor: createTokensV2('orange', 'dark').bgHover })
    expect(StyleSheet.flatten(resolveStyle({ pressed: true })).transform ?? []).toEqual(reduced ? [] : [{ scale: 0.96 }])
    await renderer.act(() => (control.props.onPress as () => void)())
    expect(onToggle).toHaveBeenCalledOnce()
  } finally { motion.reduced = false; await renderer.act(() => tree.unmount()) }
})
