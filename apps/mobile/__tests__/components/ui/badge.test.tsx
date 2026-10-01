import { describe, expect, it, vi } from 'vitest'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createTokensV2 } from '@/lib/theme'

import { Badge } from '@/components/ui/badge'

const theme = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({
  currentScheme: 'orange',
  currentTheme: 'dark',
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))

interface BadgeNode {
  props: { children?: unknown; numberOfLines?: number; style: StyleProp<TextStyle & ViewStyle> }
}

interface BadgeTree {
  root: {
    findByType(type: unknown): BadgeNode
    findAllByType(type: unknown): BadgeNode[]
  }
}

function renderBadge(variant: 'solid' | 'outline' = 'solid') {
  let tree!: BadgeTree
  void act(() => {
    tree = create(<Badge variant={variant}>premium</Badge>) as unknown as BadgeTree
  })
  return tree
}

describe('Badge (mobile)', () => {
  it.each(['dark', 'light'] as const)('uses a neutral well with readable solid text in %s mode', (mode) => {
    theme.currentTheme = mode
    const tokens = createTokensV2('orange', mode)
    const tree = renderBadge()
    const fill = String(StyleSheet.flatten(tree.root.findByType(View).props.style).backgroundColor)
    const label = String(StyleSheet.flatten(tree.root.findByType(Text).props.style).color)

    expect(fill).toBe(tokens.bgWell)
    expect(label).toBe(tokens.fg1)
    expect(contrastOnSurface(label, [tokens.bg, fill])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(label, [tokens.bg, tokens.bgCard, fill])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(label, [tokens.bg, tokens.primaryDim, fill])).toBeGreaterThanOrEqual(4.5)
  })

  it('renders its children', () => {
    const tree = renderBadge()
    const textNodes = tree.root.findAllByType(Text)
    const texts = textNodes.map((node) => node.props.children)
    expect(texts).toContain('premium')
    expect(textNodes[0]!.props.numberOfLines).toBe(1)
  })

  it.each(['solid', 'outline'] as const)('renders the %s variant at chip radius', (variant) => {
    const tree = renderBadge(variant)
    const view = tree.root.findByType(View)
    const text = tree.root.findByType(Text)
    expect(StyleSheet.flatten(view.props.style).borderRadius).toBe(8)
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({
      fontFamily: 'GeistMono_500Medium',
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 0.63,
      textTransform: 'uppercase',
    })
  })
})
