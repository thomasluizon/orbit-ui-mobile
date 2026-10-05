import React from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions, __resetTestHostConfig } from '../../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
const font = require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')
const cases = [320, 360, 384, 412, 640, 1440].flatMap((width) => (['pt-BR', 'en'] as const)
  .flatMap((locale) => [false, true].map((trial) => ({ width, locale, trial }))))

afterEach(__resetTestHostConfig)

it.each(cases)('fits the Android pitch at $width in $locale, trial=$trial', async ({ width, locale, trial }) => {
  __setWindowDimensions({ width, height: 1400, scale: 1, fontScale: 1 })
  const messages = locale === 'pt-BR' ? ptBR : en
  const t = (key: string) => String(key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages))
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<ProPitch profile={{ isTrialActive: trial }} trialDaysLeft={null} t={t} tokens={createTokensV2('orange', 'dark')} />)
  })
  try {
    const heading = tree.root.findAll((node) => node.type === Text && node.props.accessibilityRole === 'header')[0]!
    const style = StyleSheet.flatten(heading.props.style as StyleProp<TextStyle>)
    const headerNode = tree.root.findAll((node) => node.type === View && StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).gap === 8)[0]!
    const header = StyleSheet.flatten(headerNode.props.style as StyleProp<ViewStyle>)
    const column = tree.root.findAll((node) => node.type === View)[0]!
    const columnStyle = StyleSheet.flatten(column.props.style as StyleProp<ViewStyle>)
    const measure = Math.min(width, Number(columnStyle.maxWidth ?? width)) - Number(header.paddingHorizontal) * 2
    const text = trial ? messages.upgrade.convert.trialHeading : messages.upgrade.convert.freeHeading
    expect(heading.props.children).toBe(text)
    expect(heading.props.numberOfLines).toBeUndefined()
    expect(heading.props.ellipsizeMode).toBeUndefined()
    expect(heading.props.adjustsFontSizeToFit).not.toBe(true)
    expect(heading.props.allowFontScaling).not.toBe(false)
    expect(style.fontSize).toBe(width < 640 ? 28 : 34)
    expect(style.fontFamily).toBe('SpaceGrotesk_500Medium')
    expect(style.letterSpacing).toBeCloseTo(-0.02 * style.fontSize!)
    const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Space Grotesk" font-size="${style.fontSize}" letter-spacing="${style.letterSpacing}">${escaped}</text></svg>`
    const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
    process.stdout.write(`${JSON.stringify({ width, locale, trial, measure, textWidth: bounds.x + bounds.width })}\n`)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(measure)
    expect(measure).toBe(Math.min(width - 32, 620))
  } finally { await TestRenderer.act(() => tree.update(<></>)) }
})
