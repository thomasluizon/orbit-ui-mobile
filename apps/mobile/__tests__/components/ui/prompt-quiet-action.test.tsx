import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import { expect, it, vi } from 'vitest'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }),
}))

const TestRenderer = require('react-test-renderer')
interface RenderedNode {
  props: {
    style: ((state: { pressed: boolean }) => ViewStyle[]) | TextStyle[]
    onPress?: () => void
    disabled?: boolean
    accessibilityRole?: string
    accessibilityState?: { disabled: boolean }
    numberOfLines?: number
  }
}
interface RenderedTree {
  root: { findByType: (type: string) => RenderedNode }
  update: (element: React.ReactElement) => void
  unmount: () => void
}

it.each(['dark', 'light'] as const)('keeps a 44px quiet target, legible text and reversible press feedback in %s', (mode) => {
  theme.mode = mode
  const tokens = createTokensV2('orange', mode)
  const onClick = vi.fn()
  let tree!: RenderedTree
  TestRenderer.act(() => { tree = TestRenderer.create(<PromptQuietAction onClick={onClick}>Later</PromptQuietAction>) })
  try {
    const button = tree.root.findByType('Pressable')
    const style = button.props.style as (state: { pressed: boolean }) => ViewStyle[]
    const rest = StyleSheet.flatten(style({ pressed: false }))
    const pressed = StyleSheet.flatten(style({ pressed: true }))
    const labelNode = tree.root.findByType('Text')
    const label = StyleSheet.flatten(labelNode.props.style as TextStyle[])
    expect(rest.minHeight).toBe(44)
    expect(Math.max(rest.height ?? 0, rest.minHeight ?? 0)).toBe(44)
    expect(rest.minWidth).toBe(44)
    expect(rest.width).toBeUndefined()
    expect(label.fontSize).toBe(14)
    expect(label.fontFamily).toBe('Geist_500Medium')
    expect(labelNode.props.numberOfLines).toBe(1)
    expect(label.color).toBe(tokens.fg3)
    expect(contrastOnSurface(tokens.fg3, [tokens.bgElev])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(tokens.fg3, [tokens.bgElev, pressed.backgroundColor as string])).toBeGreaterThanOrEqual(4.5)
    expect(pressed.transform).toEqual([{ scale: 0.96 }])
    expect(pressed.opacity).toBeUndefined()
    expect(rest.transform).toBeUndefined()
    expect(button.props.accessibilityRole).toBe('button')
    TestRenderer.act(() => { button.props.onPress?.() })
    expect(onClick).toHaveBeenCalledOnce()
    TestRenderer.act(() => { tree.update(<PromptQuietAction disabled onClick={onClick}>Later</PromptQuietAction>) })
    expect(tree.root.findByType('Pressable').props.disabled).toBe(true)
    expect(tree.root.findByType('Pressable').props.accessibilityState?.disabled).toBe(true)
  } finally {
    TestRenderer.act(() => { tree.unmount() })
  }
})
