import React from 'react'
import { StyleSheet, View } from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'
import { CalendarHeader } from '@/app/(tabs)/calendar/_components/calendar-shell'
import { createTokensV2 } from '@/lib/theme'
import { buildYearRange } from '@orbit/shared/utils'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'
import { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'
import { useUIStore } from '@/stores/ui-store'

vi.unmock('@/components/ui/sheet')

const pickerData = vi.hoisted(() => ({ goals: [] as Record<string, unknown>[] }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: pickerData.goals }),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/components/habits/create-goal-from-habit-sheet', () => ({
  CreateGoalFromHabitSheet: 'CreateGoalFromHabitSheet',
}))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRow', props),
}))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
    present = vi.fn(() => Promise.resolve())
    dismiss = vi.fn(() => Promise.resolve())
    render() {
      return <><View testID="native-sheet-header">{this.props.header}</View>{this.props.children}<View testID="native-sheet-footer">{this.props.footer}</View></>
    }
  },
}))

const TestRenderer = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const HEADER_HEIGHT = 56
const COLLECTION_SIZE = 25
/** Every row is at least a 48px touch target, so this is a lower bound on the list's scrolled content. */
const ROW_HEIGHT_FLOOR = 48
/** The test renderer measures no text, so each line takes a fixed height. Any positive height gives the same containment result. */
const TEXT_LINE_HEIGHT = 20
/**
 * A FlatList renders a ScrollView, which puts its vertical base style under the caller's style.
 * react-native 0.86.3 `Libraries/Components/ScrollView/ScrollView.js`, `baseVertical`.
 */
const SCROLL_VIEW_BASE_STYLE = { flexGrow: 1, flexShrink: 1 }
/** The web pickers cap their list at `max-h-80`, so a tall window shows the same list on both platforms. */
const WEB_LIST_VIEWPORT_HEIGHT = 320

const WINDOWS = [
  { name: 'a landscape phone', dimensions: { width: 915, height: 412, scale: 1, fontScale: 1 } },
  { name: 'a portrait phone', dimensions: { width: 412, height: 915, scale: 1, fontScale: 1 } },
]

interface HostJson {
  type: string
  props: Record<string, unknown>
  children: (HostJson | string)[] | null
}

type LayoutStyle = Record<string, unknown>

const EDGES = [
  ['', Yoga.EDGE_ALL],
  ['Vertical', Yoga.EDGE_VERTICAL],
  ['Horizontal', Yoga.EDGE_HORIZONTAL],
  ['Top', Yoga.EDGE_TOP],
  ['Bottom', Yoga.EDGE_BOTTOM],
  ['Left', Yoga.EDGE_LEFT],
  ['Right', Yoga.EDGE_RIGHT],
] as const

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** Applies every style key that moves a box. Colour, type and radius keys leave the geometry alone. */
function applyLayoutStyle(node: YogaNode, style: LayoutStyle) {
  if (numeric(style.flex) !== undefined) node.setFlex(numeric(style.flex))
  if (numeric(style.flexGrow) !== undefined) node.setFlexGrow(numeric(style.flexGrow))
  if (numeric(style.flexShrink) !== undefined) node.setFlexShrink(numeric(style.flexShrink))
  if (numeric(style.flexBasis) !== undefined) node.setFlexBasis(numeric(style.flexBasis))
  if (numeric(style.height) !== undefined) node.setHeight(numeric(style.height))
  if (numeric(style.minHeight) !== undefined) node.setMinHeight(numeric(style.minHeight))
  if (numeric(style.maxHeight) !== undefined) node.setMaxHeight(numeric(style.maxHeight))
  if (numeric(style.gap) !== undefined) node.setGap(Yoga.GUTTER_ALL, numeric(style.gap))
  if (numeric(style.rowGap) !== undefined) node.setGap(Yoga.GUTTER_ROW, numeric(style.rowGap))
  if (numeric(style.borderWidth) !== undefined) node.setBorder(Yoga.EDGE_ALL, numeric(style.borderWidth))
  for (const [suffix, edge] of EDGES) {
    if (numeric(style[`padding${suffix}`]) !== undefined) node.setPadding(edge, numeric(style[`padding${suffix}`]))
    if (numeric(style[`margin${suffix}`]) !== undefined) node.setMargin(edge, numeric(style[`margin${suffix}`]))
  }
}

function hostChildren(element: HostJson): HostJson[] {
  return (element.children ?? []).filter((child): child is HostJson => typeof child !== 'string')
}

function scrolledRowsHeight(list: HostJson): number {
  return (list.props.data as unknown[]).length * ROW_HEIGHT_FLOOR
}

/** Builds the Yoga tree the native side lays out for a rendered host subtree. */
function buildLayoutTree(element: HostJson, nodes: Map<HostJson, YogaNode>): YogaNode {
  const node = Yoga.Node.create()
  nodes.set(element, node)
  const resolvedStyle = typeof element.props.style === 'function' ? (element.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : element.props.style
  const style = (StyleSheet.flatten(resolvedStyle as never) as LayoutStyle | undefined) ?? {}
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (element.type === 'ScrollView') {
    applyLayoutStyle(node, { ...SCROLL_VIEW_BASE_STYLE, ...style })
    node.setOverflow(Yoga.OVERFLOW_SCROLL)
    const content = Yoga.Node.create()
    const rows = Math.ceil(hostChildren(element).length / 3)
    content.setHeight(rows * 52 + 8)
    node.insertChild(content, 0)
    return node
  }
  if (element.type === 'FlatList') {
    applyLayoutStyle(node, { ...SCROLL_VIEW_BASE_STYLE, ...style })
    node.setOverflow(Yoga.OVERFLOW_SCROLL)
    const content = Yoga.Node.create()
    content.setHeight(scrolledRowsHeight(element))
    node.insertChild(content, 0)
    return node
  }
  applyLayoutStyle(node, style)
  if (element.type === 'Text') {
    const line = Yoga.Node.create()
    line.setHeight(TEXT_LINE_HEIGHT)
    node.insertChild(line, 0)
    return node
  }
  hostChildren(element).forEach((child, index) => node.insertChild(buildLayoutTree(child, nodes), index))
  return node
}

function findHost(root: HostJson | HostJson[] | null, matches: (element: HostJson) => boolean): HostJson | null {
  const queue = Array.isArray(root) ? [...root] : root ? [root] : []
  while (queue.length > 0) {
    const element = queue.shift()!
    if (matches(element)) return element
    queue.push(...hostChildren(element))
  }
  return null
}

/** The top edge of `element` inside `ancestor`, walking the Yoga parents between them. */
function topWithin(node: YogaNode, ancestor: YogaNode): number {
  let top = 0
  let current: YogaNode | null = node
  while (current && current !== ancestor) {
    top += current.getComputedTop()
    current = current.getParent()
  }
  return top
}

function buildTags(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
}

function buildGoals(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `goal-${index}`, title: `Goal ${index}`, status: 'Active', progressPercentage: index }))
}

const PICKERS = [
  {
    name: 'tag picker',
    render: () => (
      <TagPickerField
        tags={buildTags(COLLECTION_SIZE)}
        selectedIds={[]}
        atLimit={false}
        disabled={false}
        onToggle={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        editLabel="Edit"
        deleteLabel="Delete"
      />
    ),
  },
  {
    name: 'goal picker',
    render: () => <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
  },
]

/**
 * A virtualized picker hands scrolling to its own FlatList, so the sheet body cannot scroll a list
 * that runs past it. The list has to shrink into whatever height the body has left, or its last rows
 * and the tag picker's trailing controls sit below the sheet where nobody can reach them.
 */
describe('Sheet virtualized body (mobile)', () => {
  beforeEach(() => {
    useUIStore.setState({ openOverlayIds: [] })
    pickerData.goals = buildGoals(COLLECTION_SIZE)
  })

  afterEach(() => {
    __resetTestHostConfig()
  })

  it.each([320, 412])('contains the calendar years and pinned action at 640x%i', async (height) => {
    __setWindowDimensions({ width: 640, height, scale: 1, fontScale: 1 })
    let tree: any
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarHeader currentMonth={new Date(2026, 1, 1)} todayKey="2026-02-08" previousMonthLabel="Previous" nextMonthLabel="Next"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} tokens={createTokensV2('orange', 'dark')} />)
    })
    const press = (label: string) => TestRenderer.act(() => tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.accessibilityLabel === label)[0].props.onPress())
    press('February, calendar.monthPicker')
    press('2026, common.selectYear')
    const sheet = tree.root.findByType(TrueSheet)
    const measured = ['native-sheet-header', 'native-sheet-footer'].map((testID) => {
      const host = findHost(tree.toJSON(), (element) => element.props.testID === testID)!
      const nodes = new Map<HostJson, YogaNode>()
      const layout = buildLayoutTree(host, nodes)
      try {
        layout.calculateLayout(640, undefined)
        if (testID === 'native-sheet-footer') {
          const action = findHost(host, (element) => element.type === 'Pressable')!
          const button = nodes.get(action)!
          const slop = action.props.hitSlop as number
          const parent = button.getParent()!
          expect(button.getComputedHeight()).toBe(44)
          expect(button.getComputedHeight() + slop * 2).toBe(48)
          expect(button.getComputedTop() - slop).toBeGreaterThanOrEqual(0)
          expect(button.getComputedTop() + button.getComputedHeight() + slop).toBeLessThanOrEqual(parent.getComputedHeight())
        }
        return layout.getComputedHeight()
      } finally { layout.freeRecursive() }
    })
    expect(measured).toEqual([72, 108])
    TestRenderer.act(() => {
      sheet.props.header.props.onLayout({ nativeEvent: { layout: { height: measured[0] } } })
      sheet.props.footer.props.onLayout({ nativeEvent: { layout: { height: measured[1] } } })
    })
    const bodyElement = findHost(tree.toJSON(), (element) => element.props.testID === 'sheet-virtualized-body')!
    const scrollElement = findHost(bodyElement, (element) => element.props.testID === 'year-picker-scroll')!
    const spacerElement = findHost(bodyElement, (element) => element.props.testID === 'sheet-footer-space')!
    const nodes = new Map<HostJson, YogaNode>()
    const body = buildLayoutTree(bodyElement, nodes)
    try {
      body.calculateLayout(640, undefined)
      const scroller = nodes.get(scrollElement)!
      const viewport = scroller.getComputedHeight()
      const scrollTop = topWithin(scroller, body)
      const footerTop = topWithin(nodes.get(spacerElement)!, body)
      expect(scrollTop + viewport).toBeLessThanOrEqual(body.getComputedHeight() - body.getComputedPadding(Yoga.EDGE_BOTTOM))
      expect(footerTop + nodes.get(spacerElement)!.getComputedHeight()).toBeLessThanOrEqual(body.getComputedHeight() - body.getComputedPadding(Yoga.EDGE_BOTTOM))
      expect(scrollTop + viewport).toBeLessThanOrEqual(footerTop)
      expect(viewport).toBeGreaterThanOrEqual(48)
      expect(viewport).toBeLessThan(240)
      expect(body.getComputedHeight()).toBeLessThanOrEqual(height * 0.85 - 24 - measured[0]! - 24)
      expect(findHost(bodyElement, (element) => element.props.testID === 'sheet-body-scroll')).toBeNull()
      const years = buildYearRange(2026)
      const contentHeight = scroller.getChild(0).getComputedHeight()
      for (const index of [0, years.length - 1]) {
        const rowTop = 4 + Math.floor(index / 3) * 52
        const scrollOffset = index === 0 ? 0 : contentHeight - viewport
        expect(rowTop - scrollOffset).toBeGreaterThanOrEqual(0)
        expect(rowTop + 48 - scrollOffset).toBeLessThanOrEqual(viewport)
      }
      press(String(years.at(-1)!))
      expect(tree.root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === `${years.at(-1)}, common.selectYear`).length).toBeGreaterThan(0)
    } finally { body.freeRecursive(); TestRenderer.act(() => tree.unmount()) }
  })

  for (const picker of PICKERS) {
    it.each(WINDOWS)(`keeps the ${picker.name} list inside the sheet body on $name`, async ({ dimensions }) => {
      __setWindowDimensions(dimensions)
      let tree: any
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(picker.render())
        await Promise.resolve()
      })
      await TestRenderer.act(async () => {
        tree.root.findByType('ListRow').props.onClick()
        await Promise.resolve()
      })
      TestRenderer.act(() => {
        tree.root.findByType(TrueSheet).props.header.props.onLayout({ nativeEvent: { layout: { height: HEADER_HEIGHT } } })
      })

      const bodyElement = findHost(tree.toJSON(), (element) => element.props.testID === 'sheet-virtualized-body')!
      const listElement = findHost(bodyElement, (element) => element.type === 'FlatList')!
      const nodes = new Map<HostJson, YogaNode>()
      const body = buildLayoutTree(bodyElement, nodes)
      const list = nodes.get(listElement)!
      const maxBodyHeight = (StyleSheet.flatten(bodyElement.props.style as never) as { maxHeight: number }).maxHeight
      try {
        body.calculateLayout(Math.min(dimensions.width, 640), undefined)
        const contentBottom = body.getComputedHeight() - body.getComputedPadding(Yoga.EDGE_BOTTOM)
        const listTop = topWithin(list, body)
        const listContentHeight = scrolledRowsHeight(listElement)

        expect(StyleSheet.flatten(listElement.props.style as never)).toMatchObject({ maxHeight: WEB_LIST_VIEWPORT_HEIGHT })
        expect(maxBodyHeight).toBeCloseTo(dimensions.height * 0.85 - 24 - HEADER_HEIGHT - 24)
        expect(body.getComputedHeight()).toBeLessThanOrEqual(maxBodyHeight)
        for (let index = 0; index < body.getChildCount(); index += 1) {
          const child = body.getChild(index)
          expect(child.getComputedTop() + child.getComputedHeight()).toBeLessThanOrEqual(contentBottom + 0.5)
        }
        expect(listTop + list.getComputedHeight()).toBeLessThanOrEqual(contentBottom + 0.5)
        expect(list.getComputedHeight()).toBeGreaterThan(ROW_HEIGHT_FLOOR)
        expect(list.getComputedHeight()).toBeLessThan(listContentHeight)
      } finally {
        body.freeRecursive()
        TestRenderer.act(() => tree.unmount())
      }
    })
  }

  it.each([
    { name: 'the new tag action', editor: undefined, matches: (node: { props: Record<string, unknown> }) => node.props.children === 'habits.form.newTag' },
    { name: 'an open tag editor', editor: <View testID="tag-editor" />, matches: (node: { props: Record<string, unknown> }) => node.props.testID === 'tag-editor' },
  ])('scrolls $name with the tag rows inside the bounded list', async ({ editor, matches }) => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <TagPickerField
          tags={buildTags(COLLECTION_SIZE)}
          selectedIds={[]}
          atLimit={false}
          disabled={false}
          editor={editor}
          onToggle={vi.fn()}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          editLabel="Edit"
          deleteLabel="Delete"
        />,
      )
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      tree.root.findByType('ListRow').props.onClick()
      await Promise.resolve()
    })

    const bodyElement = findHost(tree.toJSON(), (element) => element.props.testID === 'sheet-virtualized-body')!
    const listElement = findHost(bodyElement, (element) => element.type === 'FlatList')!
    expect(findHost(bodyElement, matches)).toBeNull()
    let footerTree: any
    TestRenderer.act(() => {
      footerTree = TestRenderer.create(listElement.props.ListFooterComponent as React.ReactElement)
    })
    expect(footerTree.root.findAll(matches).length).toBeGreaterThan(0)
    TestRenderer.act(() => {
      footerTree.unmount()
      tree.unmount()
    })
  })
})
