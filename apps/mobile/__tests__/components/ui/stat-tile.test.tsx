import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
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

  it.each([
    { platform: 'web', screenWidth: 320, tileBorder: 0 },
    { platform: 'web', screenWidth: 344, tileBorder: 0 },
    { platform: 'web', screenWidth: 360, tileBorder: 0 },
    { platform: 'web', screenWidth: 412, tileBorder: 0 },
    { platform: 'web', screenWidth: 1352, tileBorder: 0 },
    { platform: 'mobile', screenWidth: 320, tileBorder: 2 },
    { platform: 'mobile', screenWidth: 344, tileBorder: 2 },
    { platform: 'mobile', screenWidth: 360, tileBorder: 2 },
    { platform: 'mobile', screenWidth: 412, tileBorder: 2 },
    { platform: 'mobile', screenWidth: 1352, tileBorder: 2 },
  ])('fits every weekday value in the $platform progress grid at $screenWidth px', ({ platform, screenWidth, tileBorder }) => {
    const gridWidth = Math.min(screenWidth - 32, 740)
    const columns = screenWidth >= 768 ? 4 : screenWidth >= 344 ? 2 : 1
    const tileWidth = (gridWidth - 12 * (columns - 1)) / columns
    const contentWidth = tileWidth - 48 - tileBorder
    const fontFile = require.resolve('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')

    for (const bundle of [en, ptBR]) {
      const weekdays = Object.values(bundle.dates.daysValue)
      for (const weekday of weekdays) {
        let tree: ReturnType<typeof TestRenderer.create>
        TestRenderer.act(() => {
          tree = TestRenderer.create(<StatTile value={weekday} label="Best weekday" valueSize="lg" />)
        })
        TestRenderer.act(() => {
          tree!.root.findByProps({ testID: 'stat-tile-default' }).props.onLayout?.({
            nativeEvent: { layout: { width: tileWidth } },
          })
        })
        const value = tree!.root.findAllByType('Text').find(
          (node: { props: { children: unknown } }) => node.props.children === weekday,
        )!
        const size = StyleSheet.flatten(value.props.style).fontSize as number
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100"><text x="0" y="40" font-family="Space Grotesk" font-size="${size}" font-weight="600">${weekday}</text></svg>`
        const bounds = new Resvg(svg, { font: { fontFiles: [fontFile], loadSystemFonts: false } }).getBBox()
        expect(bounds, weekday).not.toBeNull()
        expect(size, `${weekday} type size in ${platform} at ${screenWidth}px`).toBe(screenWidth >= 344 && screenWidth < 412 ? 17 : 22)
        expect(bounds!.width, `${weekday} in ${platform} at ${screenWidth}px`).toBeLessThanOrEqual(contentWidth)
        expect(value.props.numberOfLines).toBe(1)
        expect(value.props.ellipsizeMode).toBeUndefined()
        expect(StyleSheet.flatten(value.props.style).maxWidth).toBe('100%')
        const tile = tree!.root.findByProps({ testID: 'stat-tile-default' })
        expect(StyleSheet.flatten(tile.props.style).paddingVertical).toBe(16)
        expect(24 + 40 + 8 + 2 * 16).toBeLessThanOrEqual(STAT_TILE_MIN_HEIGHT)
      }
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
