import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'

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
    const value = tree.root.findAllByType('Text').find((node: any) => node.props.children === 12)
    expect(StyleSheet.flatten(value.props.style).fontVariant).toEqual(['tabular-nums'])
  })

  it.each([412, 1352])('fits the longest weekday value at %ipx', (viewportWidth) => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile value={en.dates.daysValue.wednesday} label="Best day of the week" />)
    })
    const tile = tree!.root.findByProps({ testID: 'stat-tile-default' })
    const style = StyleSheet.flatten(tile.props.style)
    const valueText = tree!.root.findAllByType('Text').find(
      (node: { props: { children: unknown } }) => node.props.children === en.dates.daysValue.wednesday,
    )!
    const valueStyle = StyleSheet.flatten(valueText.props.style)
    expect(valueStyle.fontFamily).toBe('SpaceGrotesk_600SemiBold')
    const columns = viewportWidth >= 768 ? 4 : 2
    const gridWidth = Math.min(viewportWidth - (columns === 2 ? 32 : 0), 740)
    const tileWidth = (gridWidth - (columns - 1) * 12) / columns
    const availableWidth = tileWidth - 2 * (style.paddingHorizontal ?? style.padding ?? 0) - 2 * (style.borderWidth ?? 0)
    const fontFile = require.resolve('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100"><text x="0" y="40" font-family="Space Grotesk" font-size="${valueStyle.fontSize}" font-weight="600">${en.dates.daysValue.wednesday}</text></svg>`
    const bounds = new Resvg(svg, { font: { fontFiles: [fontFile], loadSystemFonts: false } }).getBBox()

    expect(bounds).not.toBeNull()
    expect(bounds!.width + 8).toBeLessThanOrEqual(availableWidth)
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
