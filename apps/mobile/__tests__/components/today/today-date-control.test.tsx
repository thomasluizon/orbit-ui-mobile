import { Pressable, StyleSheet, Text, View } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import Yoga from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { BUTTON_SIZES } from '@orbit/shared/theme'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { AdjustmentsHorizontal, Checkbox, ChevronsDown, ChevronsUp, Eye, EyeOff, RefreshCw } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { Menu } from '@/components/ui/menu'
import { TodayDateControl } from '@/components/today/today-date-control'
import { createStyles } from '@/components/habit-list/styles'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

const callbacks = {
  onToggleSelect: vi.fn(),
  onToggleCollapse: vi.fn(),
  onRefresh: vi.fn(),
  onToggleCompleted: vi.fn(),
  onGoToPreviousDay: vi.fn(),
  onGoToToday: vi.fn(),
  onGoToNextDay: vi.fn(),
}

const props = {
  dayName: 'Wednesday',
  numericDate: '08/04/2026',
  isTodaySelected: false,
  nextDisabled: false,
  previousLabel: 'Previous day',
  todayLabel: 'Today',
  goToTodayLabel: 'Go to today',
  nextLabel: 'Next day',
  moreLabel: 'List options',
  searchLabel: 'Search',
  onSearch: vi.fn(),
  selectLabel: 'Select',
  collapseLabel: 'Collapse all',
  allCollapsed: false,
  refreshLabel: 'Refresh',
  completedLabel: 'Show completed',
  showCompleted: false,
  isFetching: false,
  ...callbacks,
}


function renderControl(overrides: Partial<typeof props> = {}) {
  let renderer: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<TodayDateControl {...props} {...overrides} />)
  })
  return renderer!
}

function measuredTextWidth(text: string, family: string, size: number, fontFile: string): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100"><text x="0" y="40" font-family="${family}" font-size="${size}">${text}</text></svg>`
  const bounds = new Resvg(svg, { font: { fontFiles: [fontFile], loadSystemFonts: false } }).getBBox()
  if (!bounds) throw new Error(`No glyph bounds for ${text}`)
  return Math.ceil(bounds.x + bounds.width + 8)
}

function button(renderer: ReturnType<typeof TestRenderer.create>, label: string) {
  return renderer.root.findAllByType(Pressable).find(
    (candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === label || candidate.props.children === label,
  )
}

describe('Today date control feedback (mobile)', () => {
  it('opens search from the final control in the date row', () => {
    const renderer = renderControl()
    const search = button(renderer, 'Search')
    if (!search) throw new Error('Search control did not render')
    TestRenderer.act(() => search.props.onPress())
    expect(props.onSearch).toHaveBeenCalledOnce()
  })
  it('keeps the full date accessible and lets its labels wrap', () => {
    const renderer = renderControl()
    const date = renderer.root.find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Wednesday, 08/04/2026')
    const labels = date.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && (node.props.children === 'Wednesday' || node.props.children === '08/04/2026'))
    expect(labels).toHaveLength(2)
    for (const label of labels) expect(label.props.numberOfLines).toBeUndefined()
  })
  it('gives the arrows, jump action, and menu control pressed feedback', () => {
    const renderer = renderControl()

    for (const label of ['Previous day', 'Next day', 'List options']) {
      const control = button(renderer, label)
      if (!control) throw new Error(`${label} control did not render`)
      const idle = StyleSheet.flatten(control.props.style({ pressed: false })) as Record<string, unknown>
      const pressed = StyleSheet.flatten(control.props.style({ pressed: true })) as Record<string, unknown>
      expect(idle.backgroundColor).toBeUndefined()
      expect(pressed.backgroundColor).toBe('rgba(250,250,250,0.13)')
    }

    const today = button(renderer, 'Go to today')
    if (!today) throw new Error('Today control did not render')
    expect(today.props.testID).toBe('button-ghost-sm')
    const next = button(renderer, 'Next day')
    expect(today.parent.children.indexOf(today)).toBe(today.parent.children.indexOf(next) + 1)
    TestRenderer.act(() => today.props.onPress())
    expect(callbacks.onGoToToday).toHaveBeenCalledOnce()
  })

  it('uses the list options glyph and title', () => {
    const renderer = renderControl()
    const control = button(renderer, 'List options')
    if (!control) throw new Error('List options control did not render')
    expect(control.findAllByType(AdjustmentsHorizontal)).toHaveLength(1)
    TestRenderer.act(() => control.props.onPress())
    const menu = renderer.root.findByType(Menu)
    expect(menu.props.title).toBe('List options')
    expect(menu.props.open).toBe(true)
  })

  it('renders the Portuguese list options labels and glyphs in both list states', () => {
    const labels = ptBr.habits
    expect([labels.collapseAll, labels.expandAll]).toEqual(['Recolher tudo', 'Expandir tudo'])
    const controlProps = {
      moreLabel: labels.listOptions,
      selectLabel: ptBr.common.select,
      collapseLabel: labels.collapseAll,
      refreshLabel: labels.refresh,
      completedLabel: labels.showCompleted,
    }
    const renderer = renderControl(controlProps)
    const control = button(renderer, labels.listOptions)
    if (!control) throw new Error('List options control did not render')
    TestRenderer.act(() => control.props.onPress())
    const menu = renderer.root.findByType(Menu)
    expect(menu.props.title).toBe(labels.listOptions)
    expect(menu.props.open).toBe(true)
    expect(menu.props.items.map(({ label, icon }: { label: string; icon?: string }) => [label, icon])).toEqual([
      [ptBr.common.select, 'checkbox'],
      [labels.collapseAll, 'chevrons-up'],
      [labels.refresh, 'refresh'],
      [labels.showCompleted, 'eye'],
    ])
    TestRenderer.act(() => renderer.update(<TodayDateControl {...props} {...controlProps} allCollapsed showCompleted collapseLabel={labels.expandAll} completedLabel={labels.hideCompleted} />))
    expect(renderer.root.findByType(Menu).props.items.map(({ label, icon }: { label: string; icon?: string }) => [label, icon])).toEqual([
      [ptBr.common.select, 'checkbox'],
      [labels.expandAll, 'chevrons-down'],
      [labels.refresh, 'refresh'],
      [labels.hideCompleted, 'eye-off'],
    ])
    for (const [name, Glyph] of [
      ['checkbox', Checkbox],
      ['chevrons-up', ChevronsUp],
      ['chevrons-down', ChevronsDown],
      ['refresh', RefreshCw],
      ['eye', Eye],
      ['eye-off', EyeOff],
    ] as const) {
      let glyphRenderer: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { glyphRenderer = TestRenderer.create(<Icon name={name} />) })
      expect(glyphRenderer!.root.findAllByType(Glyph)).toHaveLength(1)
    }
  })

  it('uses display type and leading alignment for the date', () => {
    const renderer = renderControl()
    const date = renderer.root.find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Wednesday, 08/04/2026')
    expect(StyleSheet.flatten(date.props.style)).not.toHaveProperty('alignItems', 'center')
    expect(StyleSheet.flatten(date.props.style)).toMatchObject({ minWidth: 0, maxWidth: '100%' })
    const row = date.parent
    expect(StyleSheet.flatten(row.props.style)).toHaveProperty('flexWrap', 'wrap')
    const day = date.findAllByType(Text)[0]
    expect(StyleSheet.flatten(day.props.style)).toMatchObject({ fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22 })
  })

  it.each([1, 2])('keeps an off-today date and controls inside 400dp with text scale %s', (fontScale) => {
    const dayName = 'Quarta-feira'
    const renderer = renderControl({ dayName })
    const date = renderer.root.find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === `${dayName}, 08/04/2026`)
    const row = date.parent
    const rowStyle = StyleSheet.flatten(row.props.style)
    const dateStyle = StyleSheet.flatten(date.props.style)
    expect(rowStyle).toHaveProperty('flexWrap', 'wrap')
    expect(dateStyle).toMatchObject({ flexBasis: 'auto', flexShrink: 0, maxWidth: '100%' })
    expect(button(renderer, 'Go to today')).toBeDefined()

    const listContent = StyleSheet.flatten(createStyles(createTokensV2()).listContent)
    const rowWidth = 400 - 2 * listContent.paddingHorizontal
    const dayWidth = measuredTextWidth(dayName, 'Space Grotesk', 22,
      require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')) * fontScale
    const numericWidth = measuredTextWidth(props.numericDate, 'Geist Mono', 12,
      require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf')) * fontScale
    const jumpWidth = measuredTextWidth(props.todayLabel, 'Geist', BUTTON_SIZES.sm.fontSize,
      require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf')) * fontScale
      + BUTTON_SIZES.sm.paddingX * 2

    const layout = Yoga.Node.create()
    try {
      layout.setWidth(rowWidth)
      layout.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
      layout.setFlexWrap(rowStyle.flexWrap === 'wrap' ? Yoga.WRAP_WRAP : Yoga.WRAP_NO_WRAP)
      layout.setGap(Yoga.GUTTER_ALL, rowStyle.gap ?? 0)

      const icon = () => {
        const node = Yoga.Node.create()
        node.setWidth(44)
        node.setHeight(44)
        return node
      }
      layout.insertChild(icon(), 0)
      const dateNode = Yoga.Node.create()
      dateNode.setFlexBasisAuto()
      dateNode.setFlexGrow(dateStyle.flexGrow ?? 0)
      dateNode.setFlexShrink(dateStyle.flexShrink ?? 1)
      dateNode.setMaxWidthPercent(100)
      dateNode.setMinWidth(dateStyle.minWidth ?? 0)
      for (const width of [dayWidth, numericWidth]) {
        const textNode = Yoga.Node.create()
        textNode.setMeasureFunc(() => ({ width, height: 26 * fontScale }))
        dateNode.insertChild(textNode, dateNode.getChildCount())
      }
      layout.insertChild(dateNode, 1)
      layout.insertChild(icon(), 2)
      const jump = Yoga.Node.create()
      jump.setWidth(jumpWidth)
      jump.setHeight(44)
      layout.insertChild(jump, 3)
      layout.insertChild(icon(), 4)
      layout.insertChild(icon(), 5)

      layout.calculateLayout(rowWidth, 'auto', Yoga.DIRECTION_LTR)
      expect(dateNode.getComputedLayout().width).toBeGreaterThanOrEqual(dayWidth)
      for (let index = 0; index < layout.getChildCount(); index += 1) {
        const bounds = layout.getChild(index).getComputedLayout()
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.left + bounds.width).toBeLessThanOrEqual(rowWidth)
      }
      expect(layout.getChild(5).getComputedLayout().top).toBeGreaterThan(0)
    } finally {
      layout.freeRecursive()
    }
  })

  it('does not paint or invoke the disabled forward control', () => {
    let renderer: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      renderer = TestRenderer.create(<TodayDateControl {...props} nextDisabled />)
    })
    const next = button(renderer, 'Next day')
    if (!next) throw new Error('Next day control did not render')
    const pressed = StyleSheet.flatten(next.props.style({ pressed: true })) as Record<string, unknown>
    expect(pressed.backgroundColor).toBeUndefined()
    expect(next.props.disabled).toBe(true)
  })
})
