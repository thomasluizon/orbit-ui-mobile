import React from 'react'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it, vi } from 'vitest'
import { Text } from 'react-native'
import { listRowValueCases } from '@orbit/shared/test-support/list-row-values'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { createTokensV2 } from '@/lib/theme'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { Switch } from '@/components/ui/switch'
import { ListRow } from '@/components/ui/list-row'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const TestRenderer = require('react-test-renderer')

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn() } }))
const preferences = vi.hoisted(() => ({ consent: false }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}), useMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ marketingEmailConsent: preferences.consent }), patchProfile: vi.fn(), invalidate: vi.fn() }) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))


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
  if (typeof style.width === 'number') node.setWidth(style.width)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  applySize(node, style)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (typeof style.paddingEnd === 'number') node.setPadding(Yoga.EDGE_END, style.paddingEnd)
  if (typeof style.marginVertical === 'number') node.setMargin(Yoga.EDGE_VERTICAL, style.marginVertical)
  if (typeof style.marginHorizontal === 'number') node.setMargin(Yoga.EDGE_HORIZONTAL, style.marginHorizontal)
}

function layoutHost(host: HostRow, texts: Map<string, { node: YogaNode; width: number }>, controls: YogaNode[] = []): YogaNode {
  const node = Yoga.Node.create()
  const declared = host.props.style
  const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {}) as TextStyle & ViewStyle
  applyStyle(node, style)
  if (host.props['data-slot'] === 'switch-track') controls.push(node)
  const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
  if (host.type === 'Text' && label) {
    const width = textWidth(label, style)
    texts.set(label, { node, width })
    node.setMeasureFunc((available, mode) => {
      const measured = mode === Yoga.MEASURE_MODE_UNDEFINED ? width : Math.min(width, available)
      return { width: measured, height: style.lineHeight ?? Number(style.fontSize) * 1.4 }
    })
  } else {
    (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').forEach((child, index) => node.insertChild(layoutHost(child, texts, controls), index))
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

afterEach(async () => { await i18n.changeLanguage('en') })

it.each(['en', 'pt-BR'].flatMap((locale) => [0, 1, 3].map((count) => ({ locale, count }))))('keeps $count key state readable in $locale at 412px using Android styles and fonts', async ({ locale, count }) => {
  await i18n.changeLanguage(locale)
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={createMockProfile({ hasProAccess: true, activeApiKeyCount: count })} unlocked={false} />) })
  const row = tree.root.findByType(ListRow)
  const hosts = tree.toJSON()
  const findRow = (host: HostRow): HostRow | undefined => {
    const declared = host.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {})
    if (style.minHeight === 52) return host
    return (host.children ?? []).filter((child): child is HostRow => typeof child !== 'string').map(findRow).find(Boolean)
  }
  const rowHost = (Array.isArray(hosts) ? hosts : [hosts]).map(findRow).find(Boolean)!
  const texts = new Map<string, { node: YogaNode; width: number }>()
  const layout = layoutHost(rowHost, texts)
  try {
    layout.calculateLayout(380, 'auto', Yoga.DIRECTION_LTR)
    const title = texts.get(row.props.title)!
    const value = texts.get(row.props.value)!
    const titleBox = position(title.node)
    const valueBox = position(value.node)
    const stacked = valueBox.top >= titleBox.bottom
    expect(title.node.getComputedWidth(), JSON.stringify({title:titleBox, value:valueBox, titleWidth:title.width,valueWidth:value.width,row: rowHost})).toBeGreaterThanOrEqual(title.width)
    expect(value.node.getComputedWidth()).toBeGreaterThanOrEqual(value.width)
    const pixelRoundingAllowance = 1
    expect(stacked ? valueBox.top - titleBox.bottom : valueBox.left - titleBox.right).toBeGreaterThanOrEqual(12 - pixelRoundingAllowance)
    expect(valueBox.right).toBeLessThanOrEqual(380)
    expect(stacked).toBe(title.width + value.width + 12 > title.node.getParent()!.getParent()!.getComputedWidth())
  } finally { layout.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
})

it.each(['en', 'pt-BR'])('keeps every value caller inside its Android row at 412px in %s', async (locale) => {
  await i18n.changeLanguage(locale)
  const cases = listRowValueCases(locale, (key, values) => i18n.t(key, values))
  for (const { surface, props, statusRing, truncatesValue } of cases) {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ListRow {...props} onClick={() => {}} trailing={statusRing ? <Text style={{ width: 24, height: 24 }} /> : undefined} />) })
    const texts = new Map<string, { node: YogaNode; width: number }>()
    const layout = layoutHost(tree.toJSON(), texts)
    try {
      layout.calculateLayout(380, 'auto', Yoga.DIRECTION_LTR)
      const title = texts.get(props.title)!
      const value = texts.get(props.value!)!
      const titleBox = position(title.node)
      const valueBox = position(value.node)
      const gap = Math.max(valueBox.top - titleBox.bottom, valueBox.left - titleBox.right)
      const valueHost = tree.root.findAllByType(Text).find((node: { props: { children: string } }) => node.props.children === props.value)!
      expect(StyleSheet.flatten(valueHost.props.style).fontSize, surface).toBe(12)
      expect(gap, surface).toBeGreaterThanOrEqual(11)
      expect(valueBox.left, surface).toBeGreaterThanOrEqual(0)
      expect(valueBox.right, surface).toBeLessThanOrEqual(380)
      expect(value.node.getComputedWidth(), surface).toBeGreaterThan(0)
      if (truncatesValue) {
        expect(value.node.getComputedWidth(), surface).toBeLessThan(value.width)
        expect(valueHost.props.numberOfLines, surface).toBe(1)
      } else if (!props.wrapValue) expect(value.node.getComputedWidth(), surface).toBeGreaterThanOrEqual(value.width)
    } finally { layout.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
  }
})


it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412, 1440].map((width) => ({ locale, width }))))('keeps the Android notification label readable in $locale at $width px', async ({ locale, width }) => {
  await i18n.changeLanguage(locale)
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<PushDevicesRow tokens={createTokensV2()} count={5} max={5} currentDeviceRegistered={false} supported loading={false} error={false} permissionStatus="undetermined" registrationStatus="idle" onToggle={() => {}} onOpenSettings={() => {}} onRetry={() => {}} />) })
  const texts = new Map<string, { node: YogaNode; width: number }>()
  const layout = layoutHost(tree.toJSON(), texts)
  try {
    layout.calculateLayout(width - 32, 'auto', Yoga.DIRECTION_LTR)
    const label = i18n.t('profile.settingsRows.alertsOnThisDevice')
    const title = texts.get(label)!
    expect(title.node.getComputedWidth()).toBeGreaterThanOrEqual(title.width)
    expect(position(title.node).right).toBeLessThanOrEqual(width - 32 - 48)
    const switches = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; 'data-slot'?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')
    expect(switches).toHaveLength(1)
    expect(switches[0].props.accessibilityState).toMatchObject({ checked: false })
  } finally { layout.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
})


it.each(['en', 'pt-BR'].flatMap((locale) => [412, 1352].flatMap((width) => [true, false].map((consent) => ({ locale, width, consent })))))('aligns Android answered email consent $consent with the device switch in $locale at $width px', async ({ locale, width, consent }) => {
  await i18n.changeLanguage(locale)
  preferences.consent = consent
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<><MarketingConsentSection contained showSectionLabel={false} /><PushDevicesRow tokens={createTokensV2()} count={1} max={5} currentDeviceRegistered={false} supported loading={false} error={false} permissionStatus="undetermined" registrationStatus="idle" onToggle={() => {}} onOpenSettings={() => {}} onRetry={() => {}} /></>) })
  const rows = tree.root.findAllByType(ListRow)
  expect(rows).toHaveLength(2)
  const bounds = rows.map((row: { props: React.ComponentProps<typeof ListRow> }) => {
    let rendered!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { rendered = TestRenderer.create(<ListRow {...row.props} />) })
    const controls: YogaNode[] = []
    const layout = layoutHost(rendered.toJSON(), new Map(), controls)
    try {
      layout.calculateLayout(width - 32, 'auto', Yoga.DIRECTION_LTR)
      const controlHost = rendered.root.find((node: { type: unknown; props: { accessibilityRole?: string; 'data-slot'?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')
      const declared = controlHost.props.style
      const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared)
      expect(style.minHeight).toBe(52)
      expect(controls).toHaveLength(1)
      expect(controls[0]!.getComputedHeight()).toBe(28)
      expect(controls[0]!.getComputedWidth()).toBe(48)
      expect(position(controls[0]!).right).toBe(width - 32 - 16)
      return layout.getComputedHeight()
    } finally { layout.freeRecursive(); TestRenderer.act(() => rendered.unmount()) }
  })
  expect(bounds).toEqual([52, 52])
  TestRenderer.act(() => tree.unmount())
})
