import React from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { createTokensV2 } from '@/lib/theme'
import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __setWindowDimensions, __resetTestHostConfig } from '../../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
const font = require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')
const cases = [320, 360, 384, 412, 600, 640, 840, 1352, 1440].flatMap((width) => (['pt-BR', 'en'] as const)
  .flatMap((locale) => [false, true].map((trial) => ({ width, locale, trial }))))

afterEach(__resetTestHostConfig)

function PitchContent({ trial, t }: Readonly<{ trial: boolean; t: (key: string) => string }>) {
  const frameStyle = useContentFrameStyle(652)
  return <View style={frameStyle}>
    <ProPitch inset={false} profile={{ isTrialActive: trial }} trialDaysLeft={null} t={t} tokens={createTokensV2('orange', 'dark')} />
  </View>
}

it.each(cases)('fits the Android pitch at $width in $locale, trial=$trial', async ({ width, locale, trial }) => {
  __setWindowDimensions({ width, height: 1400, scale: 1, fontScale: 1 })
  const messages = locale === 'pt-BR' ? ptBR : en
  const t = (key: string) => String(key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages))
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<PitchContent trial={trial} t={t} />) as typeof tree
  })
  try {
    const heading = tree.root.findAll((node) => node.type === Text && node.props.accessibilityRole === 'header')[0]!
    const style = StyleSheet.flatten(heading.props.style as StyleProp<TextStyle>)
    const text = trial ? messages.upgrade.convert.trialHeading : messages.upgrade.convert.freeHeading
    const measure = measureProfileRow(tree.toJSON(), width, 1).texts.find(({ label }) => label === text)!.width
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
    expect(measure).toBe(width < 1024 ? width - 32 : 652)
  } finally { await TestRenderer.act(() => tree.update(<></>)) }
})
