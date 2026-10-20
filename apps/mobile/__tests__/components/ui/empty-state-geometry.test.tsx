import React from 'react'
import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { emptyStateTitles } from '@orbit/shared/__tests__/empty-state-titles'
import { EmptyState } from '@/components/ui/empty-state'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
const cases = [320, 360, 384, 412].flatMap((width) => [
  { width, locale: 'pt-BR', words: ptBR }, { width, locale: 'en', words: en },
].flatMap(({ words, ...viewport }) => emptyStateTitles(words).map((title) => ({ ...viewport, ...title }))))

it.each(cases)('$key fits at $width in $locale without a line clamp', async ({ width, title, inset }) => {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<EmptyState title={title} />) })
  try {
    const host = tree.root.findAll((node) => node.props.testID === 'empty-state')[0]!
    const container = StyleSheet.flatten(host.props.style as StyleProp<ViewStyle>)
    const label = tree.root.findAll((node) => node.type === Text)[0]!
    const style = StyleSheet.flatten(label.props.style as StyleProp<TextStyle>)
    expect(label.props.children).toBe(title)
    expect(label.props.numberOfLines).toBeUndefined()
    expect(label.props.ellipsizeMode).toBeUndefined()
    expect(label.props.allowFontScaling).not.toBe(false)
    expect(container.height).toBeUndefined()
    expect(container.paddingHorizontal).toBe(24)
    expect(container.paddingVertical).toBe(48)
    expect(container.gap).toBe(24)
    expect(style.fontSize).toBe(20)
    expect(style.lineHeight).toBe(28)
    expect(style.fontFamily).toBe('Geist_500Medium')
    const font = require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')
    const escaped = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Geist" font-size="${style.fontSize}">${escaped}</text></svg>`
    const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - inset * 2 - Number(container.paddingHorizontal) * 2)
    expect(title).not.toMatch(/[.!]$/)
  } finally { await TestRenderer.act(() => tree.update(<></>)) }
})
