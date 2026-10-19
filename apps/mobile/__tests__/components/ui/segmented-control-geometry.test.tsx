import React from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
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
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/use-habits', () => ({ useHabits: () => ({ data: { habitsById: new Map() }, isLoading: false, isError: false, refetch: vi.fn() }) }))

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

interface Host {
  type: string
  props: { style?: StyleProp<ViewStyle & TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle & TextStyle>); contentContainerStyle?: StyleProp<ViewStyle>; accessibilityRole?: string; numberOfLines?: number; testID?: string }
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

function buildLayout(host: Host, fontScale: number, labels: { node: YogaNode; intrinsic: number; host: Host }[], radios: YogaNode[], groups: { node: YogaNode; radios: YogaNode[] }[] = [], inRadio = false): YogaNode {
  const node = Yoga.Node.create()
  const declared = host.props.style
  const style = StyleSheet.flatten([{}, typeof declared === 'function' ? declared({ pressed: false }) : declared])
  const radioStart = radios.length
  const isRadio = Boolean(host.props.testID?.startsWith('segment-'))
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
      owner = Yoga.Node.create()
      applyStyle(owner, StyleSheet.flatten(host.props.contentContainerStyle))
      node.insertChild(owner, 0)
    }
    (host.children ?? []).filter((child): child is Host => typeof child !== 'string').forEach((child, index) => owner.insertChild(buildLayout(child, fontScale, labels, radios, groups, inRadio), index))
  }
  if (host.props.testID?.startsWith('segmented-control-')) groups.push({ node, radios: radios.slice(radioStart) })
  return node
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

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => ['fixed', 'flexible', 'interval', 'oneTime'].flatMap((mode) => [1, 2].map((fontScale) => ({ locale, width, mode, fontScale }))))))('fits the onboarding $mode containers in $locale at $width and scale $fontScale', async ({ locale, width, mode, fontScale }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<FlowShell nav={false}><OnboardingCreateHabit
    title="Walk" emoji="" proposed={false} correcting canSaveRepeatWeeks atLimit={false} allowance={5}
    schedule={{ frequencyUnit: mode === 'oneTime' ? null : mode === 'fixed' ? 'Day' : 'Week', frequencyQuantity: 1, intervalWeeks: 1, days: mode === 'fixed' ? ['Monday'] : [], isGeneral: false, isFlexible: mode === 'flexible', dueTime: '' }}
    onCorrect={vi.fn()} onToggleDay={vi.fn()} onTimeChange={vi.fn()} onModeChange={vi.fn()} onFrequencyUnitChange={vi.fn()} onQuantityChange={vi.fn()} onIntervalWeeksChange={vi.fn()}
  /></FlowShell>) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const radios: YogaNode[] = []
  const groups: { node: YogaNode; radios: YogaNode[] }[] = []
  const layout = buildLayout(tree.toJSON(), fontScale, labels, radios, groups)
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
        if (fontScale === 1) expect(label.node.getComputedWidth()).toBeGreaterThanOrEqual(label.intrinsic)
        else {
          expect(label.host.props.numberOfLines).toBeUndefined()
          expect(label.node.getComputedHeight()).toBeLessThanOrEqual(radio.getComputedHeight())
        }
      }
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})

const segmentSites = collectSegmentCallSites(resolve(process.cwd(), '../..'), 'mobile')

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412].flatMap((width) => ['calendar', 'goal', 'plans', 'share'].map((surface) => ({ locale, width, surface })))))('fits the real $surface container in $locale at $width', async ({ locale, width, surface }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
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
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(element) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const radios: YogaNode[] = []
  const groups: { node: YogaNode; radios: YogaNode[] }[] = []
  const layout = buildLayout(tree.toJSON(), 1, labels, radios, groups)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    expect(group.radios).toHaveLength(surface === 'calendar' ? choices.length : surface === 'share' ? 3 : 2)
    expect(new Set(group.radios.map((node) => node.getComputedTop())).size).toBe(1)
    expect(group.node.getComputedWidth()).toBeLessThanOrEqual(width - (surface === 'goal' || surface === 'share' ? 48 : 32))
    for (const [index, radio] of radios.entries()) {
      expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(48)
        expect(radio.getComputedWidth()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedLeft() + radio.getComputedWidth()).toBeLessThanOrEqual(group.node.getComputedWidth())
      expect(labels[index]!.node.getComputedWidth()).toBeGreaterThanOrEqual(labels[index]!.intrinsic)
      expect(labels[index]!.host.props.numberOfLines).toBe(1)
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})


it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 384, 412, 600, 768, 840, 1352].map((width) => ({ locale, width }))))('keeps the Hoje view switch on one line in $locale at $width', async ({ locale, width }) => {
  await i18n.changeLanguage(locale)
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: ReturnType<typeof TestRenderer.create> & { toJSON: () => Host; unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ width: '100%', maxWidth: 740, paddingHorizontal: 16 }}><HabitViewSwitch value="today" onChange={vi.fn()} /></View>) as typeof tree })
  const labels: { node: YogaNode; intrinsic: number; host: Host }[] = []
  const radios: YogaNode[] = []
  const groups: { node: YogaNode; radios: YogaNode[] }[] = []
  const layout = buildLayout(tree.toJSON(), 1, labels, radios, groups)
  try {
    layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR)
    expect(groups).toHaveLength(1)
    expect(radios).toHaveLength(3)
    expect(new Set(radios.map((node) => node.getComputedTop())).size).toBe(1)
    for (const [index, radio] of radios.entries()) {
      expect(radio.getComputedWidth()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedHeight()).toBeGreaterThanOrEqual(48)
      expect(radio.getComputedLeft() + radio.getComputedWidth()).toBeLessThanOrEqual(groups[0]!.node.getComputedWidth())
      expect(labels[index]!.node.getComputedWidth()).toBeGreaterThanOrEqual(labels[index]!.intrinsic)
      expect(labels[index]!.host.props.numberOfLines).toBe(1)
    }
  } finally { layout.freeRecursive(); await TestRenderer.act(() => tree.unmount()) }
})
