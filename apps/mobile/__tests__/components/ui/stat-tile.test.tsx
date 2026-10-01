import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions } from '@/test-mocks/react-native'

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
    const value = tree.root.findAllByType('Text').find((node: any) => node.props.children === 12)
    expect(StyleSheet.flatten(value.props.style).fontVariant).toEqual(['tabular-nums'])
  })

  it.each([320, 344, 360, 411, 412, 500, 768, 1352, 1440])('keeps all progress values at 24px and permits wrapping at %ipx', (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    const values = ['38%', 2, ...Object.values(en.dates.daysValue), ...Object.values(ptBR.dates.daysValue), 'Caminhar', 'A long habit name that needs several lines']
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<>{values.map((value) => <StatTile key={value} value={value} label="Figure" />)}</>)
    })
    const tiles = tree!.root.findAllByProps({ testID: 'stat-tile-default' })
    for (const tile of tiles) {
      expect(StyleSheet.flatten(tile.props.style).minHeight).toBe(STAT_TILE_MIN_HEIGHT)
      expect(StyleSheet.flatten(tile.props.style).height).toBeUndefined()
    }
    const renderedValues = tree!.root.findAllByType('Text').filter(
      (node: { props: { children: string | number } }) => values.includes(node.props.children),
    )
    expect(renderedValues).toHaveLength(values.length)
    for (const value of renderedValues) {
      expect(StyleSheet.flatten(value.props.style).fontSize).toBe(24)
      expect(value.props.numberOfLines).toBeUndefined()
      expect(value.props.ellipsizeMode).toBeUndefined()
      expect(value.props.adjustsFontSizeToFit).toBeUndefined()
      expect(StyleSheet.flatten(value.props.style).maxWidth).toBe('100%')
    }
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
