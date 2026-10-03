import { afterEach, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

interface NativeNode {
  type: unknown
  props: { style?: StyleProp<ViewStyle & TextStyle>; children?: string; numberOfLines?: number; adjustsFontSizeToFit?: boolean }
}

interface RenderedPitch {
  root: { findAll: (predicate: (node: NativeNode) => boolean) => NativeNode[] }
  unmount: () => void
}

const TestRenderer = require('react-test-renderer') as {
  act: (action: () => void) => Promise<void>
  create: (element: ReactElement) => RenderedPitch
}

afterEach(__resetTestHostConfig)

it.each([320, 360, 384, 412].flatMap((width) => [
  { width, locale: 'pt-BR', messages: ptBR },
  { width, locale: 'en', messages: en },
]))('keeps both allowance captions whole at $width in $locale', async ({ width, messages }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  const t = (key: string) => String(key.split('.').reduce<unknown>(
    (current, part) => (current as Record<string, unknown>)[part], messages,
  ))
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<ProPitch profile={null} trialDaysLeft={null} t={t} tokens={createTokensV2('orange', 'dark')} />)
  })
  try {
    const captions = tree.root.findAll((node) => node.type === 'Text' && node.props.children === messages.upgrade.convert.perDay)
    expect(captions).toHaveLength(2)
    for (const caption of captions) {
      expect(caption.props.numberOfLines).toBeUndefined()
      expect(caption.props.adjustsFontSizeToFit).toBeUndefined()
      const style = StyleSheet.flatten(caption.props.style)
      expect(style.fontSize).toBe(14)
      const font = require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Geist" font-size="${style.fontSize}">${caption.props.children}</text></svg>`
      const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
      const card = tree.root.findAll((node) => node.type === 'View' && StyleSheet.flatten(node.props.style).flexDirection === 'row')[0]!
      const section = tree.root.findAll((node) => node.type === 'View' && StyleSheet.flatten(node.props.style).gap === 12)[0]!
      const cardStyle = StyleSheet.flatten(card.props.style)
      const sectionStyle = StyleSheet.flatten(section.props.style)
      const columnWidth = (width - 2 * Number(sectionStyle.paddingHorizontal) - 2 * (Number(cardStyle.padding) + Number(cardStyle.borderWidth)) - 2 * Number(cardStyle.gap) - 1) / 2
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(columnWidth)
    }
  } finally { await TestRenderer.act(() => tree.unmount()) }
})
