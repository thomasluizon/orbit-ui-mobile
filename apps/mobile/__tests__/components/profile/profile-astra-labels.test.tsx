import React from 'react'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { ProfileAstraContent } from '@/app/(tabs)/profile/_components/profile-astra-content'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const TestRenderer = require('react-test-renderer')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}), useMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/components/profile/profile-api-keys', () => ({ ProfileApiKeys: () => null }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ isTrialActive: false }) }) }))

interface HostRow {
  type: string
  props: { style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle); numberOfLines?: number; accessibilityRole?: string; 'data-slot'?: string }
  children: (HostRow | string)[] | null
}

function textWidth(label: string, style: TextStyle): number {
  const mono = style.fontFamily === 'GeistMono_400Regular'
  const family = mono ? 'Geist Mono' : 'Geist'
  const file = mono ? require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf') : require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')
  const escaped = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="40" font-family="${family}" font-size="${style.fontSize}" letter-spacing="${style.letterSpacing ?? 0}">${escaped}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [file], loadSystemFonts: false } }).getBBox()
  if (!bounds) throw new Error(`No glyph bounds for ${label}`)
  return Math.ceil(bounds.x + bounds.width)
}

function applySize(node: YogaNode, style: ViewStyle) {
  if (style.flex === 1) node.setFlex(1)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (typeof style.flexBasis === 'number') node.setFlexBasis(style.flexBasis)
  if (style.flexBasis === 'auto') node.setFlexBasisAuto()
  if (style.minWidth === 0) node.setMinWidth(0)
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
  if (style.maxWidth === '50%') node.setMaxWidthPercent(50)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applySize(node, style)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START)
  if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (typeof style.paddingEnd === 'number') node.setPadding(Yoga.EDGE_END, style.paddingEnd)
  if (typeof style.marginVertical === 'number') node.setMargin(Yoga.EDGE_VERTICAL, style.marginVertical)
  if (typeof style.marginHorizontal === 'number') node.setMargin(Yoga.EDGE_HORIZONTAL, style.marginHorizontal)
}

function layoutHost(host: HostRow, texts: Map<string, { node: YogaNode; width: number; wordWidth: number }>, scale: number, controls: YogaNode[] = []): YogaNode {
  const node = Yoga.Node.create()
  const declared = host.props.style
  const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {}) as TextStyle & ViewStyle
  applyStyle(node, style)
  if (host.props['data-slot'] === 'switch-track') controls.push(node)
  const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
  if (host.type === 'Text' && label) {
    const scaledStyle = { ...style, fontSize: Number(style.fontSize) * scale }
    const width = textWidth(label, scaledStyle)
    const wordWidth = Math.max(...label.split(' ').map((word) => textWidth(word, scaledStyle)))
    texts.set(label, { node, width, wordWidth })
    node.setMeasureFunc((available, mode) => {
      const measured = mode === Yoga.MEASURE_MODE_UNDEFINED ? width : Math.min(width, available)
      const lines = Math.max(1, Math.ceil(width / measured))
      return { width: measured, height: lines * (style.lineHeight ?? Number(style.fontSize) * 1.4) * scale }
    })
  } else {
    (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').forEach((child, index) => node.insertChild(layoutHost(child, texts, scale, controls), index))
  }
  return node
}

function position(node: YogaNode): { left: number; top: number; right: number; bottom: number } {
  let left = 0
  let top = 0
  let current: YogaNode | null = node
  while (current) {
    left += current.getComputedLeft()
    top += current.getComputedTop()
    current = current.getParent()
  }
  return { left, top, right: left + node.getComputedWidth(), bottom: top + node.getComputedHeight() }
}

afterEach(async () => { await i18n.changeLanguage('en'); __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }) })
const cases = (['pt-BR', 'en'] as const).flatMap((locale) => [320, 360, 384, 412].flatMap((width) => [false, true].flatMap((hasProAccess) => [1, 2].map((scale) => ({ locale, width, hasProAccess, scale })))))
it.each(cases)('fits Android Astra labels in $locale at $width px, Pro $hasProAccess, scale $scale', async ({ locale, width, hasProAccess, scale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
  const profile = createMockProfile({ hasProAccess, isTrialActive: false, aiMessagesUsed: 0, aiMessagesLimit: 15, aiSummaryEnabled: true, proactiveAstraEnabled: true })
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileAstraContent profile={profile} patchProfile={vi.fn()} />) })
  const texts = new Map<string, { node: YogaNode; width: number; wordWidth: number }>()
  const controls: YogaNode[] = []
  const layout = layoutHost(tree.toJSON(), texts, scale, controls)
  try {
    layout.calculateLayout(width - 32, 'auto', Yoga.DIRECTION_LTR)
    const panel = tree.root.findByProps({ testID: 'astra-allowance-panel' })
    expect.soft(StyleSheet.flatten(panel.props.style).padding).toBe(16)
    const group = tree.root.find((node: { type: unknown; props: { style?: ViewStyle } }) => node.type === 'View' && node.props.style?.gap === 24)
    expect(group).toBeDefined()
    const labels = ['profile.allowance.title', 'profile.proactiveAstra.title', 'profile.aiSummary.title'].map((key) => i18n.t(key))
    for (const label of labels) {
      const title = tree.root.findAllByType(Text).find((node: { props: { children: string } }) => node.props.children === label)!
      expect.soft(title.props.numberOfLines, label).toBeUndefined()
      expect(title.props.adjustsFontSizeToFit, label).not.toBe(true)
      expect(title.props.allowFontScaling, label).not.toBe(false)
      const style = StyleSheet.flatten(title.props.style)
      expect(style.fontSize).toBe(17)
      expect(style.height).toBeUndefined()
      expect(style.maxHeight).toBeUndefined()
      const measured = texts.get(label)!
      expect.soft(measured.node.getComputedWidth(), label).toBeGreaterThanOrEqual(scale === 1 ? measured.width : measured.wordWidth)
      expect(position(measured.node).right, label).toBeLessThanOrEqual(width - 32)
      expect(measured.node.getComputedHeight(), label).toBeGreaterThanOrEqual(style.lineHeight * scale)
    }
    for (const row of tree.root.findAllByType(ListRow)) expect(row.props.textMode).toBe('label')
    const switches = tree.root.findAllByType(ListRow).filter((row: { props: React.ComponentProps<typeof ListRow> }) => row.props.toggle)
    expect(switches).toHaveLength(hasProAccess ? 2 : 0)
    expect(controls).toHaveLength(switches.length)
    for (const [index, control] of switches.entries()) {
      const offset = position(texts.get(control.props.title)!.node).top - position(controls[index]!).top
      expect(Math.abs(offset + 23.8 * scale / 2 - controls[index]!.getComputedHeight() / 2)).toBeLessThanOrEqual(1)
      expect(controls[index]!.getComputedHeight()).toBe(28)
      expect(controls[index]!.getComputedWidth()).toBe(48)
      expect(labels).toContain(control.props.title)
      expect(control.props.toggle.checked).toBe(true)
    }
    expect(tree.root.findAllByType(RowList)).toHaveLength(1)
  } finally { layout.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
})
