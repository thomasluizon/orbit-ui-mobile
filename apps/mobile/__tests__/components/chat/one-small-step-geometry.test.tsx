import React from 'react'
import { StyleSheet, View, type TextStyle } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { BUTTON_SIZES, SMALL_PILL_VISIBLE_MIN, typeRoles } from '@orbit/shared/theme'
import { makeOneSmallStepCard } from '@orbit/shared/test-support/chat-fixtures'
import { OneSmallStepCard } from '@/components/chat/one-small-step-card'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = ReturnType<typeof renderer.create> & { toJSON: () => Parameters<typeof measureProfileRow>[0]; unmount: () => void }
afterEach(async () => { __resetTestHostConfig(); await i18n.changeLanguage('en') })

type Host = Parameters<typeof measureProfileRow>[0] & { props: { width?: number; height?: number } }
function measurable(host: Host): Host {
  if (host.type === 'Svg') return { ...host, props: { ...host.props, style: { width: host.props.width, height: host.props.height } }, children: null }
  return { ...host, children: host.children?.map(child => typeof child === 'string' ? child : measurable(child)) ?? null }
}

it.each([320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].map(fontScale => ({ width, locale, fontScale })))))('contains complete Android action labels at $width in $locale at font scale $fontScale', async ({ width, locale, fontScale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  await i18n.changeLanguage(locale)
  const card = makeOneSmallStepCard(locale)
  let tree!: Tree
  await renderer.act(() => { tree = renderer.create(<View style={{ padding: 16 }}><OneSmallStepCard card={card} onSendMessage={vi.fn()} /></View>) as Tree })
  try {
    const layout = measureProfileRow(measurable(tree.toJSON()), Math.min(width, 740), fontScale)
    const frame = layout.boxes.find(box => box.testID === 'block-frame-resting')!
    expect(frame).toBeDefined()
    for (const action of card.actions) {
      const button = layout.controls.find(control => control.accessibilityLabel === action.label)!
      const label = layout.texts.find(text => text.label === action.label)!
      expect(button).toBeDefined()
      expect(label).toBeDefined()
      expect(label.clipped, action.label).toBe(false)
      if (fontScale === 1) expect(label.lines, action.label).toBe(1)
      expect(label.left, action.label).toBeGreaterThanOrEqual(button.left)
      expect(label.right, action.label).toBeLessThanOrEqual(button.right)
      expect(label.top, action.label).toBeGreaterThanOrEqual(button.top)
      expect(label.bottom, action.label).toBeLessThanOrEqual(button.bottom)
      expect(button.left, action.label).toBeGreaterThanOrEqual(frame.left)
      expect(button.right, action.label).toBeLessThanOrEqual(frame.right)
      expect(button.top, action.label).toBeGreaterThanOrEqual(frame.top)
      expect(button.bottom, action.label).toBeLessThanOrEqual(frame.bottom)
      expect(button.height).toBeGreaterThanOrEqual(SMALL_PILL_VISIBLE_MIN)
      const text = tree.root.findAll(node => String(node.type) === 'Text' && node.props.children === action.label)[0]!
      expect(StyleSheet.flatten(text.props.style as TextStyle).fontSize).toBe(BUTTON_SIZES.sm.fontSize)
    }
  } finally { await renderer.act(() => tree.unmount()) }
})

it('renders the Android starting step with the shared h2 metrics', async () => {
  const card = makeOneSmallStepCard('en')
  let tree!: Tree
  await renderer.act(() => { tree = renderer.create(<OneSmallStepCard card={card} />) as Tree })
  try {
    const text = tree.root.findAll(node => String(node.type) === 'Text' && node.props.children === card.suggestion.step)[0]!
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({
      fontSize: typeRoles.h2.size,
      fontFamily: 'Geist_500Medium',
      lineHeight: typeRoles.h2.size * typeRoles.h2.lineHeight,
      letterSpacing: typeRoles.h2.size * typeRoles.h2.letterSpacingEm,
    })
  } finally { await renderer.act(() => tree.unmount()) }
})
