import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import type { ReactTestRenderer, ReactTestRendererJSON, ReactTestInstance } from 'react-test-renderer'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitMetricsSchema, type HabitDetail, type HabitMetrics } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { StatTile } from '@/components/ui/stat-tile'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
type RenderedTree = ReactTestRenderer & { toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null; unmount(): void }
let tree: RenderedTree
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: translate, i18n: { language: mocks.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useIsFocused: () => true }))
vi.mock('@/app/(tabs)/use-today-date', () => ({ useCurrentDate: () => '2026-08-29' }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/stat-tile', async (original) => ({
  ...(await original<typeof import('@/components/ui/stat-tile')>()),
  StatTile: vi.fn((props: React.ComponentProps<typeof StatTile>) => React.createElement('StatTile', { ...props })),
}))
const mocks = vi.hoisted(() => ({
  detail: null as HabitDetail | null,
  metrics: undefined as HabitMetrics | undefined,
  loading: false,
  error: false,
  language: 'en',
}))

function translate(key: string): string {
  const catalog = mocks.language === 'pt-BR' ? ptBR : en
  const value = key.split('.').reduce<unknown>((branch, part) =>
    typeof branch === 'object' && branch !== null ? Reflect.get(branch, part) : undefined, catalog)
  return typeof value === 'string' ? value : key
}

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: mocks.detail, isLoading: false, isError: false }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: mocks.loading, isError: mocks.error }),
  useHabits: () => ({ data: { habitsById: new Map(), topLevelHabits: [] }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: vi.fn() }),
  useUpdateHabit: () => ({ mutateAsync: vi.fn() }),
  useUpdateChecklist: () => ({ mutateAsync: vi.fn() }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true, timeZone: 'UTC', language: mocks.language, weekStartDay: 1 } }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/habits/habit-detail-fields', () => ({ HabitDetailFields: () => null, HabitDetailSchedule: () => null }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))

beforeEach(() => {
  mocks.detail = { ...makeHabitDetail(), children: [] }
  mocks.metrics = habitMetricsSchema.parse({ currentStreak: 2, longestStreak: 4, weeklyCompletionRate: 80, monthlyCompletionRate: 74.6, totalCompletions: 2, lastCompletedDate: null })
  mocks.loading = false
  mocks.error = false
  mocks.language = 'en'
})

afterEach(() => {
  TestRenderer.act(() => tree.unmount())
  vi.mocked(StatTile).mockClear()
  __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
})

function renderScreen() {
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'habit-detail-stat-card')
}

function rowTexts(card: ReactTestInstance) {
  return card.findAll((node) => typeof node.type === 'string' && node.props.testID === 'habit-detail-stat-row')
    .map((row) => row.findAll((node) => String(node.type) === 'Text' && typeof node.props.testID === 'string').map((text) =>
      text.findAll((node) => String(node.type) === 'Text' && typeof node.props.children === 'string').map((node) => node.props.children).join('')))
}

type LayoutStyle = TextStyle & ViewStyle
function applyDimensions(node: YogaNode, style: LayoutStyle) {
  node.setMinWidth(typeof style.minWidth === 'number' ? style.minWidth : undefined)
  node.setMinHeight(typeof style.minHeight === 'number' ? style.minHeight : undefined)
  node.setHeight(typeof style.height === 'number' ? style.height : undefined)
  node.setMaxWidth(style.maxWidth as number | `${number}%` | undefined)
  node.setWidth(style.width as number | `${number}%` | undefined)
  node.setGap(Yoga.GUTTER_ALL, typeof style.gap === 'number' ? style.gap : undefined)
  node.setPadding(Yoga.EDGE_ALL, style.padding as number | undefined)
  node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical as number | undefined)
  node.setBorder(Yoga.EDGE_ALL, style.borderWidth)
}

function applyFlex(node: YogaNode, style: LayoutStyle) {
  node.setFlexGrow(style.flexGrow ?? (style.flex ?? 0))
  node.setFlexShrink(style.flexShrink ?? 0)
  if (style.flexBasis !== undefined) node.setFlexBasis(style.flexBasis as number | `${number}%` | 'auto')
  if (style.alignItems === 'flex-end') node.setAlignItems(Yoga.ALIGN_FLEX_END)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'baseline') node.setAlignItems(Yoga.ALIGN_BASELINE)
}

function textContent(host: ReactTestRendererJSON): string {
  if (typeof host.children === 'string') return host.children
  return (host.children ?? []).map((child) => typeof child === 'string' ? child : textContent(child)).join('')
}

function buildLayout(host: ReactTestRendererJSON, fontScale: number, config: ReturnType<typeof Yoga.Config.create>): YogaNode {
  const node = Yoga.Node.create(config)
  const style = (StyleSheet.flatten(host.props.style) ?? {}) as LayoutStyle
  applyDimensions(node, style)
  applyFlex(node, style)
  if (host.type === 'Text') {
    const child = host.children?.[0]
    const nestedStyle = child && typeof child !== 'string' ? StyleSheet.flatten(child.props.style) as TextStyle : undefined
    const text = textContent(host)
    node.setMeasureFunc((availableWidth) => {
      const textWidth = text.length * (nestedStyle?.fontSize ?? style.fontSize ?? 14) * 0.52 * fontScale
      const lines = availableWidth > 0 ? Math.max(1, Math.ceil(textWidth / availableWidth)) : 1
      return { width: Math.min(textWidth, availableWidth), height: (style.lineHeight ?? 20) * fontScale * lines }
    })
  } else {
    for (const child of Array.isArray(host.children) ? host.children : []) if (typeof child !== 'string') node.insertChild(buildLayout(child, fontScale, config), node.getChildCount())
  }
  return node
}

function cardLayout(fontScale: number) {
  const host = tree.toJSON()
  function findCard(node: ReactTestRendererJSON): ReactTestRendererJSON | undefined {
    if (node.props.testID === 'habit-detail-stat-card') return node
    for (const child of Array.isArray(node.children) ? node.children : []) {
      if (typeof child !== 'string') {
        const card = findCard(child)
        if (card) return card
      }
    }
  }
  const card = (Array.isArray(host) ? host : [host]).filter((node): node is ReactTestRendererJSON => node !== null).map(findCard).find(Boolean)
  expect(card).toBeDefined()
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const layout = buildLayout(card!, fontScale, config)
  layout.calculateLayout(412 - 32, undefined)
  const height = layout.getComputedHeight()
  for (let index = 0; index < 3; index++) expect(layout.getChild(index).getComputedHeight()).toBeGreaterThanOrEqual(48)
  layout.freeRecursive()
  config.free()
  return height
}

describe('habit detail stat card (mobile)', () => {
  it.each(['en', 'pt-BR'])('renders one card with three rows in %s', (language) => {
    mocks.language = language
    const cards = renderScreen()
    expect(cards).toHaveLength(1)
    expect(rowTexts(cards[0]!)).toEqual([
      [translate('habits.detail.currentStreak'), '2'],
      [translate('habits.detail.longestStreak'), '4'],
      [translate('habits.detail.monthlyRate'), '75%'],
    ])
    expect(StatTile).not.toHaveBeenCalled()
  })

  it('uses Sem recaída for an avoid habit in Portuguese', () => {
    mocks.language = 'pt-BR'
    mocks.detail = { ...makeHabitDetail(), isBadHabit: true, children: [] }
    const cards = renderScreen()
    expect(cards).toHaveLength(1)
    expect(rowTexts(cards[0]!)[0]).toEqual(['Sem recaída', '2'])
  })

  it.each([1, 2])('keeps loaded and loading heights at 412 and font scale %i', (fontScale) => {
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale })
    for (const language of ['en', 'pt-BR']) {
      mocks.language = language
      mocks.loading = false
      const cards = renderScreen()
      expect(cards).toHaveLength(1)
      const loadedHeight = cardLayout(fontScale)
      mocks.loading = true
      TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
      const card = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'habit-detail-stat-card')[0]!
      expect(card.props.accessibilityState).toEqual({ busy: true })
      expect(card.props.accessible).toBe(true)
      expect(card.props.accessibilityRole).toBe('progressbar')
      expect(card.props.accessibilityLabel).toBe(translate('common.loading'))
      expect(rowTexts(card)).toEqual([
        [translate('habits.detail.currentStreak'), translate('common.loading')],
        [translate('habits.detail.longestStreak'), translate('common.loading')],
        [translate('habits.detail.monthlyRate'), translate('common.loading')],
      ])
      expect(cardLayout(fontScale)).toBeCloseTo(loadedHeight, 1)
      expect(StatTile).not.toHaveBeenCalled()
      TestRenderer.act(() => tree.unmount())
    }
  })

  it.each(['missing', 'empty', 'error'])('keeps one no data line for %s metrics', (state) => {
    if (state === 'missing') mocks.metrics = undefined
    if (state === 'empty') mocks.metrics = { ...mocks.metrics!, totalCompletions: 0 }
    mocks.error = state === 'error'
    expect(renderScreen()).toHaveLength(0)
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === en.habits.detail.noDataYet)).toHaveLength(1)
    expect(StatTile).not.toHaveBeenCalled()
  })
})
