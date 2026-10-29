import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Config as YogaConfig, type Node as YogaNode } from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { afterEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { FlowShell } from '@/components/shell/flow-shell'
import { CalendarHeader } from '@/app/(tabs)/calendar/_components/calendar-shell'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { ShareCardSheet } from '@/components/share/share-card-sheet'
import { collectSegmentCallSites, segmentTranslation } from '../../../../../packages/shared/src/test-support/segmented-control-inventory'
import { resolve } from 'node:path'
import { createTokensV2, createSurfaces } from '@/lib/theme'
import { i18n } from '@/lib/i18n'
import { HabitViewSwitch } from '@/components/today/habit-view-switch'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useUIStore } from '@/stores/ui-store'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() }, isLoading: false, isError: false, refetch: vi.fn() }) }))

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')
type SegmentTree = ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }

interface Host {
  type: string
  props: { style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>); contentContainerStyle?: StyleProp<ViewStyle>; accessibilityRole?: string; numberOfLines?: number; testID?: string; onLayout?: (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void }
  children: (Host | string)[] | null
}

function textWidth(label: string, size: number) {
  if (!label) return 0
  const font = require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Geist" font-size="${size}">${label}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
  return Math.ceil(bounds.x + bounds.width)
}

function applyFlexSizing(node: YogaNode, style: ViewStyle) {
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (typeof style.flexBasis === 'number') node.setFlexBasis(style.flexBasis)
  if (style.flexBasis === 'auto') node.setFlexBasisAuto()
}

function applyStyle(node: YogaNode, style: ViewStyle) {
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START)
  applyFlexSizing(node, style)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (style.width === '100%') node.setWidthPercent(100)
  if (style.maxWidth === '100%') node.setMaxWidthPercent(100)
  if (typeof style.padding === 'number') node.setPadding(Yoga.EDGE_ALL, style.padding)
  if (typeof style.paddingVertical === 'number') node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (typeof style.borderWidth === 'number') node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
}

function buildLayout(host: Host, fontScale: number, labels: { node: YogaNode; intrinsic: number; host: Host }[], radios: YogaNode[], groups: { node: YogaNode; radios: YogaNode[] }[] = [], inRadio = false, config?: YogaConfig): YogaNode {
  const node = Yoga.Node.create(config)
  const declared = host.props.style
  const style = StyleSheet.flatten([{}, typeof declared === 'function' ? declared({ pressed: false }) : declared])
  const radioStart = radios.length
  const isRadio = host.props.accessibilityRole === 'radio' || host.props.testID === 'segmented-trigger'
  inRadio ||= isRadio
  applyStyle(node, style)
  if (isRadio) radios.push(node)
  if (host.type === 'Text') {
    const label = (host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
    const intrinsic = textWidth(label, (style.fontSize ?? 14) * fontScale)
    if (inRadio) labels.push({ node, intrinsic, host })
    node.setMeasureFunc((width, mode) => {
      const measuredWidth = mode === Yoga.MEASURE_MODE_UNDEFINED ? intrinsic : Math.min(width, intrinsic)
      const lines = inRadio && fontScale > 1.3 ? Math.max(1, Math.ceil(intrinsic / Math.max(1, measuredWidth))) : 1
      return { width: measuredWidth, height: (style.lineHeight ?? 20) * fontScale * lines }
    })
  } else {
    let owner = node
    if (host.props.contentContainerStyle) {
      owner = Yoga.Node.create(config)
      applyStyle(owner, StyleSheet.flatten(host.props.contentContainerStyle))
      node.insertChild(owner, 0)
    }
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => owner.insertChild(buildLayout(child, fontScale, labels, radios, groups, inRadio, config), index))
  }
  if (host.props.testID === 'segment-frame') groups.push({ node, radios: radios.slice(radioStart) })
  return node
}

function expectOptionCount(options: YogaNode[], expected: number, fontScale: number) {
  expect(options).toHaveLength(options.length === 1 ? 1 : expected)
  if (fontScale === 1) expect(options).toHaveLength(expected)
}

function expectLabelLines(label: Host, optionCount: number, fontScale: number) {
  if (optionCount > 1) expect(label.props.numberOfLines).toBe(fontScale > 1.3 ? undefined : 1)
}

async function measureSegments(tree: SegmentTree, width: number, fontScale: number, config?: YogaConfig) {
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const radios: YogaNode[] = []
  const groups: { node: YogaNode; radios: YogaNode[] }[] = []
  const initial = buildLayout(tree.toJSON(), fontScale, [], [], groups, false, config)
  initial.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
  await TestRenderer.act(() => {
    for (const frame of tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'segment-frame')) {
      const index = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'segment-frame').indexOf(frame)
      const emitLayout = frame.props.onLayout as NonNullable<Host['props']['onLayout']>
      emitLayout({ nativeEvent: { layout: { x: 0, y: 0, width: groups[index]!.node.getComputedWidth(), height: groups[index]!.node.getComputedHeight() } } })
    }
    for (const word of tree.root.findAll((node) => String(node.type) === 'Text' && node.props.testID === 'segment-measure')) {
      const style = StyleSheet.flatten(word.props.style as StyleProp<TextStyle>)
      const emitText = word.props.onTextLayout as (event: { nativeEvent: { lines: import('react-native').TextLayoutEvent['nativeEvent']['lines'] } }) => void
      emitText({ nativeEvent: { lines: [{ text: String(word.props.children), width: textWidth(String(word.props.children), style.fontSize! * fontScale), height: style.lineHeight! * fontScale, x: 0, y: 0, ascender: 0, capHeight: 0, descender: 0, xHeight: 0 }] } })
    }
  })
  initial.freeRecursive()
  groups.length = 0
  const layout = buildLayout(tree.toJSON(), fontScale, labels, radios, groups, false, config)
  layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
  return { layout, labels, radios, groups }
}

afterEach(__resetTestHostConfig)

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; maxContentWidth?: number }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() { return <View style={{ maxWidth: this.props.maxContentWidth, width: '100%' }}>{this.props.children}</View> }
  },
}))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) }))
vi.mock('@/hooks/use-subscription-plans', async () => ({ ...(await import('@orbit/shared/utils/subscription-pricing')), useSubscriptionPlans: () => ({}) }))

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark', surfaces: createSurfaces('orange', 'dark') }) }))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: () => ({ recap: null, isLoading: true, isError: false }) }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ shareRef: { current: null }, isSharing: false, hasError: false, canShareFiles: true }) }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}))

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => ['fixed', 'flexible', 'interval', 'oneTime'].flatMap((mode) => [1, 1.3, 1.6, 2].map((fontScale) => ({ locale, width, mode, fontScale }))))))('fits the onboarding $mode containers in $locale at $width and scale $fontScale', async ({ locale, width, mode, fontScale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<FlowShell nav={false}><OnboardingCreateHabit
    title="Walk" emoji="" proposed={false} correcting canSaveRepeatWeeks atLimit={false} allowance={5}
    schedule={{ frequencyUnit: mode === 'oneTime' ? null : mode === 'fixed' ? 'Day' : 'Week', frequencyQuantity: 1, intervalWeeks: 1, days: mode === 'fixed' ? ['Monday'] : [], isGeneral: false, isFlexible: mode === 'flexible', dueTime: '' }}
    onCorrect={vi.fn()} onToggleDay={vi.fn()} onTimeChange={vi.fn()} onModeChange={vi.fn()} onFrequencyUnitChange={vi.fn()} onQuantityChange={vi.fn()} onIntervalWeeksChange={vi.fn()}
  /></FlowShell>) as typeof tree })
  const { layout, labels, radios, groups } = await measureSegments(tree, width, fontScale)
  try {
    layout.calculateLayout(width, 915, Yoga.DIRECTION_LTR)
    expect(groups).toHaveLength(mode === 'flexible' || mode === 'interval' ? 2 : 1)
    for (const { node: group, radios: options } of groups) {
      expect(new Set(options.map((node) => node.getComputedTop())).size).toBe(1)
      expect(group.getComputedWidth()).toBe(width - 32)
      for (const radio of options) {
        expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(48)
        expect(radio.getComputedWidth()).toBeGreaterThanOrEqual(48)
        expect(radio.getComputedLeft() + radio.getComputedWidth()).toBeLessThanOrEqual(group.getComputedWidth())
        const label = labels[radios.indexOf(radio)]!
        expect(label.node.getComputedWidth(), 'A segment must fit each whole word').toBeGreaterThanOrEqual(label.intrinsic)
        if (fontScale > 1.3) {
          expect(label.host.props.numberOfLines).toBeUndefined()
          expect(label.node.getComputedHeight()).toBeLessThanOrEqual(radio.getComputedHeight())
        }
      }
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

const segmentSites = collectSegmentCallSites(resolve(process.cwd(), '../..'), 'mobile')

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => ['calendar', 'goal', 'plans', 'share'].flatMap((surface) => [1, 1.3, 1.6, 2].map((fontScale) => ({ locale, width, surface, fontScale }))))))('fits the real $surface container in $locale at $width and scale $fontScale', async ({ locale, width, surface, fontScale }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(habitKeys.list({}), [])
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  const tokens = createTokensV2('orange', 'dark')
  const messages = locale === 'en' ? en : ptBR
  const calendarKeys = segmentSites.find((site) => site.path === 'app/(tabs)/calendar.tsx')!.optionKeys
  expect(calendarKeys).toHaveLength(4)
  const option = (index: number) => ({ value: calendarKeys[index]!, label: segmentTranslation(messages, calendarKeys[index]!) })
  const choices = [option(0), option(1), option(2), option(3)] as const
  const element = surface === 'calendar' ? <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-01" previousMonthLabel={messages.common.previousMonth} nextMonthLabel={messages.common.nextMonth}
    onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} tokens={tokens}
    viewSelector={<SegmentedControl fullWidth label={messages.calendar.view.switchLabel} value={choices[0].value} options={choices} onChange={vi.fn()} />} />
    : surface === 'goal' ? <CreateGoalSheet open onClose={vi.fn()} />
    : surface === 'share' ? <ShareCardSheet onClose={vi.fn()} />
    : <PlanSelection plans={null} isLoading isError={false} isOnline monthlyOffer={null} yearlyOffer={null} selectedInterval="yearly" checkoutLoading={null} checkoutError="" checkoutDisabled={false}
      onSelectInterval={vi.fn()} onCheckout={vi.fn()} onRetry={vi.fn()} t={i18n.t.bind(i18n)} tokens={tokens} />
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>) as typeof tree })
  const { layout, labels, radios, groups } = await measureSegments(tree, width, fontScale)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    const narrowCalendar = surface === 'calendar' && locale === 'pt-BR' && width === 320
    const optionCounts: Record<string, number> = { calendar: choices.length, share: 3, goal: 2, plans: 2 }
    expectOptionCount(group.radios, narrowCalendar ? 1 : optionCounts[surface]!, fontScale)
    expect(new Set(group.radios.map((node) => node.getComputedTop())).size).toBe(1)
    expect(group.node.getComputedWidth()).toBeLessThanOrEqual(width - (surface === 'goal' || surface === 'share' ? 48 : 32))
    for (const [index, radio] of radios.entries()) {
      expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(48)
        expect(radio.getComputedWidth()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedLeft() + radio.getComputedWidth()).toBeLessThanOrEqual(group.node.getComputedWidth())
      expect(labels[index]!.node.getComputedWidth()).toBeGreaterThanOrEqual(labels[index]!.intrinsic)
      expectLabelLines(labels[index]!.host, radios.length, fontScale)
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()); queryClient.clear() }
})


it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412, 600, 768, 840, 1352].flatMap((width) => [1, 1.3, 1.6, 2].map((fontScale) => ({ locale, width, fontScale })))))('keeps Hoje view words whole in $locale at $width and scale $fontScale', async ({ locale, width, fontScale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ width: '100%', maxWidth: 740, paddingHorizontal: 16 }}><HabitViewSwitch value="today" onChange={vi.fn()} /></View>) as typeof tree })
  const { layout, labels, radios, groups } = await measureSegments(tree, width, fontScale)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(groups).toHaveLength(1)
    expect(radios).toHaveLength(radios.length === 1 ? 1 : 3)
    if (fontScale === 1) expect(radios).toHaveLength(3)
    expect(new Set(radios.map((node) => node.getComputedTop())).size).toBe(1)
    for (const [index, radio] of radios.entries()) {
      expect(radio.getComputedWidth()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedLeft() + radio.getComputedWidth()).toBeLessThanOrEqual(groups[0]!.node.getComputedWidth())
      expect(labels[index]!.node.getComputedWidth()).toBeGreaterThanOrEqual(labels[index]!.intrinsic)
      expectLabelLines(labels[index]!.host, radios.length, fontScale)
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

function SelectedView({ surface, onChange }: Readonly<{ surface: 'today' | 'calendar'; onChange: (view: string) => void }>) {
  const [view, setView] = React.useState('month')
  const activeView = useUIStore((state) => state.activeView)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const keys = segmentSites.find((site) => site.path === 'app/(tabs)/calendar.tsx')!.optionKeys
  const option = (index: number) => ({ value: ['month', 'week', 'range', 'agenda'][index]!, label: i18n.t(keys[index]!) })
  const options = [option(0), option(1), option(2), option(3)] as const
  return <View style={{ width: '100%' }}>
    {surface === 'today' ? <HabitViewSwitch value={activeView} onChange={(next) => { setActiveView(next); onChange(next) }} />
      : <CalendarHeader tokens={createTokensV2('orange', 'dark')} currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-30"
        previousMonthLabel="Previous month" nextMonthLabel="Next month" onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        viewSelector={<SegmentedControl fullWidth label={i18n.t('calendar.view.switchLabel')} value={view} options={options} onChange={(next) => { setView(next); onChange(next) }} />} />}
    <Text testID="current-view">{surface === 'today' ? activeView : view}</Text>
  </View>
}

it.each([
  ...(['today', 'calendar'] as const).flatMap((surface) => ['en', 'pt-BR'].map((locale) => ({ surface, locale, width: 200, fontScale: 2 }))),
  { surface: 'calendar' as const, locale: 'pt-BR', width: 320, fontScale: 1 },
])('selects the same $surface view through the folded sheet in $locale at scale $fontScale and restores the row', async ({ surface, locale, width, fontScale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
  useUIStore.setState({ activeView: 'today' })
  const onChange = vi.fn()
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<SelectedView surface={surface} onChange={onChange} />) as SegmentTree })
  try {
    const measured = await measureSegments(tree, width, fontScale)
    measured.layout.freeRecursive()
    const trigger = () => tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.testID === 'segmented-trigger')[0]!
    expect(trigger().props.accessibilityLabel).toContain(i18n.t(surface === 'today' ? 'habits.viewToday' : 'calendar.view.month'))
    await TestRenderer.act(() => (trigger().props.onPress as () => void)())
    expect(trigger().props.accessibilityState).toMatchObject({ expanded: true })
    const rows = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'checkbox')
    expect(rows).toHaveLength(surface === 'today' ? 3 : 4)
    expect(rows.filter((row) => (row.props.accessibilityState as { checked: boolean }).checked)).toHaveLength(1)
    const last = rows.at(-1)!
    const label = last.findAll((node) => String(node.type) === 'Text')[0]!.props.children
    await TestRenderer.act(() => (last.props.onPress as () => void)())
    expect(onChange).not.toHaveBeenCalled()
    const sheet = tree.root.findAll((node) => node.type === TrueSheet)[0]!
    await TestRenderer.act(() => (sheet.props.onDidDismiss as () => void)())
    const destination = surface === 'today' ? 'general' : 'agenda'
    expect(onChange).toHaveBeenCalledExactlyOnceWith(destination)
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.testID === 'current-view')[0]!.props.children).toBe(destination)
    expect(trigger().props.accessibilityLabel).toContain(label)
    const restored = await measureSegments(tree, 740, fontScale)
    restored.layout.freeRecursive()
    expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'radio')).toHaveLength(surface === 'today' ? 3 : 4)
    expect(onChange).toHaveBeenCalledTimes(1)
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it('keeps every calendar word whole at double text size', async () => {
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
  const keys = segmentSites.find((site) => site.path === 'app/(tabs)/calendar.tsx')!.optionKeys
  const option = (index: number) => ({ value: String(index), label: segmentTranslation(en, keys[index]!) })
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ paddingHorizontal: 16 }}><SegmentedControl fullWidth label="Views" value="0" onChange={vi.fn()} options={[option(0), option(1), option(2), option(3)]} /></View>) as SegmentTree })
  const measured = await measureSegments(tree, 320, 2)
  try {
    expect(measured.labels.length).toBeGreaterThan(0)
    for (const label of measured.labels) expect(label.node.getComputedWidth(), 'A word cannot split across lines').toBeGreaterThanOrEqual(label.intrinsic)
  } finally { measured.layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

it.each(['en', 'pt-BR'].flatMap((locale) => [false, true].map((fullWidth) => ({ locale, fullWidth }))))('restores segments when the folded allocation grows in $locale, fullWidth $fullWidth', async ({ locale, fullWidth }) => {
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
  const messages = locale === 'en' ? en : ptBR
  const keys = segmentSites.find((site) => site.path === 'app/(tabs)/calendar.tsx')!.optionKeys
  const option = (index: number) => ({ value: String(index), label: segmentTranslation(messages, keys[index]!) })
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ width: '100%' }}><SegmentedControl fullWidth={fullWidth} label="Views" value="0" onChange={vi.fn()} options={[option(0), option(1), option(2), option(3)]} /></View>) as SegmentTree })
  try {
    const compact = await measureSegments(tree, 200, 2)
    compact.layout.freeRecursive()
    expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.testID === 'segmented-trigger')).toHaveLength(1)
    const expanded = await measureSegments(tree, 740, 2)
    try {
      expect(tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'radio')).toHaveLength(4)
      for (const label of expanded.labels) expect(label.node.getComputedWidth()).toBeGreaterThanOrEqual(label.intrinsic)
    } finally { expanded.layout.freeRecursive() }
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it('keeps multiword labels in taller segments without breaking a word', async () => {
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ paddingHorizontal: 16 }}><SegmentedControl fullWidth label="Views" value="all" onChange={vi.fn()} options={[{ value: 'all', label: 'All habits' }, { value: 'general', label: 'General habits' }]} /></View>) as SegmentTree })
  const measured = await measureSegments(tree, 320, 2)
  try {
    expect(measured.radios).toHaveLength(2)
    expect(new Set(measured.radios.map((radio) => radio.getComputedTop())).size).toBe(1)
    for (const label of measured.labels) {
      const words = label.host.children!.filter((child): child is string => typeof child === 'string').join('').split(/\s+/)
      expect(label.node.getComputedWidth()).toBeGreaterThanOrEqual(Math.max(...words.map((word) => textWidth(word, 28))))
      expect(label.host.props.numberOfLines).toBeUndefined()
    }
    expect(measured.labels.some((label) => label.node.getComputedHeight() > 40)).toBe(true)
  } finally { measured.layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

it.each(['en', 'pt-BR'])('settles the label-hugging selector at fractional pixel density in %s', async (locale) => {
  __setWindowDimensions({ width: 320, height: 915, scale: 2.625, fontScale: 1 })
  const messages = locale === 'en' ? en : ptBR
  const options = [
    { value: 'standard', label: messages.goals.form.typeStandard },
    { value: 'streak', label: messages.goals.form.typeStreak },
  ] as const
  const config = Yoga.Config.create()
  config.setPointScaleFactor(2.625)
  let tree!: SegmentTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ paddingHorizontal: 16 }}><SegmentedControl label="Goal type" value="standard" options={options} onChange={vi.fn()} /></View>) as SegmentTree })
  try {
    const samples: { folded: boolean; width: number }[] = []
    for (let frame = 0; frame < 10; frame++) {
      const measured = await measureSegments(tree, 320, 1, config)
      samples.push({ folded: measured.radios.length === 1, width: measured.groups[0]!.node.getComputedWidth() })
      measured.layout.freeRecursive()
    }
    const transitions = samples.filter((sample, index) => index > 0 && sample.folded !== samples[index - 1]!.folded)
    expect(transitions, JSON.stringify(samples)).toHaveLength(0)
    expect(samples.at(-1)!.folded).toBe(false)
    for (const sample of samples) expect(sample.width).toBe(288)
  } finally { config.free(); await TestRenderer.act(() => tree.unmount()) }
})
