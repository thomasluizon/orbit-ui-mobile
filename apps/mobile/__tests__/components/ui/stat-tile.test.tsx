import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

import { StatTile } from '@/components/ui/stat-tile'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: theme.mode }),
}))

describe('StatTile (mobile)', () => {
  it('renders value and label', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile  value="7 dias" label="Sequência" />)
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['7 dias', 'Sequência']))
  })

  it('renders numeric values', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile  value={12} label="Total" />)
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain(12)
  })

  it.each(['dark', 'light'] as const)('keeps empty text above the normal-text contrast floor in %s', (mode) => {
    theme.mode = mode
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile state="empty" emptyLabel="No data" label="Top habit" />)
    })
    const emptyText = tree!.root.findAllByType('Text').find(
      (node: { props: { children: unknown } }) => node.props.children === 'No data',
    )!
    const foreground = StyleSheet.flatten(emptyText.props.style).color as string
    const tokens = createTokensV2('purple', mode)

    expect(contrastOnSurface(foreground, [tokens.bg, tokens.bgCard]))
      .toBeGreaterThanOrEqual(4.5)
  })
})
