import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import Yoga from 'yoga-layout'
import { Resvg } from '@resvg/resvg-js'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { formatLocaleDayMonth } from '@orbit/shared/utils'
import { MoreVertical, Checkbox, ChevronsDown, ChevronsUp, Eye, EyeOff, RefreshCw } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { Menu } from '@/components/ui/menu'
import { Shell412 } from '@/components/shell/shell-412'
import { TodayDateControl } from '@/components/today/today-date-control'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      let value: unknown = ptBr
      for (const segment of key.split('.')) {
        if (typeof value !== 'object' || value === null) return key
        value = (value as Record<string, unknown>)[segment]
      }
      return typeof value === 'string' ? value : key
    },
    i18n: { language: 'pt-BR' },
  }),
}))

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
  menuHeading: 'Options',
  shortDayName: 'Wed',
  dayName: 'Wednesday',
  numericDate: '08/04/2026',
  isTodaySelected: false,
  nextDisabled: false,
  previousLabel: 'Previous day',
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
  it.each([false, true])('returns through the centred label only when away from today, today=%s', (isTodaySelected) => {
    const onGoToToday = vi.fn()
    const renderer = renderControl({ isTodaySelected, onGoToToday })
    const row = renderer.root.findByProps({ testID: 'today-date-row' })
    const label = row.findAllByType(Pressable).find((node: { props: Record<string, unknown> }) =>
      String(node.props.accessibilityLabel).includes(props.numericDate))
    expect(label, 'the date label is the return control').toBeDefined()
    expect(label!.props.accessibilityRole).toBe('button')
    expect(label!.props.accessibilityState).toEqual({ disabled: isTodaySelected })
    expect(String(label!.props.accessibilityLabel)).toContain(props.dayName)
    if (!isTodaySelected) expect(label!.props.accessibilityLabel).toContain(props.goToTodayLabel)
    const style = StyleSheet.flatten(label!.props.style({ pressed: false }))
    expect(style.minHeight).toBeGreaterThanOrEqual(48)
    expect(style.minWidth).toBeGreaterThanOrEqual(48)
    TestRenderer.act(() => label!.props.onPress())
    expect(onGoToToday).toHaveBeenCalledTimes(isTodaySelected ? 0 : 1)
    const header = renderer.root.findByProps({ testID: 'today-header-actions' })
    expect(header.findAllByType(Pressable).some((node: { props: Record<string, unknown> }) =>
      String(node.props.accessibilityLabel).includes(props.goToTodayLabel))).toBe(false)
    TestRenderer.act(() => renderer.unmount())
  })

  it.each([false, true])('keeps one focus indicator and available hover feedback, today=%s', (isTodaySelected) => {
    const renderer = renderControl({ isTodaySelected })
    const date = renderer.root.findByProps({ testID: 'today-date-row' }).findAllByType(Pressable).find(
      (node: { props: Record<string, unknown> }) => String(node.props.accessibilityLabel).includes(props.numericDate),
    )!
    TestRenderer.act(() => date.props.onHoverIn())
    expect(StyleSheet.flatten(date.props.style({ pressed: false })).backgroundColor).toBe(isTodaySelected ? undefined : 'rgba(250,250,250,0.13)')
    TestRenderer.act(() => date.props.onFocus({ target: 1, currentTarget: 1 }))
    const indicators = () => date.findAllByType(View).filter((node: { props: Record<string, unknown> }) =>
      StyleSheet.flatten<ViewStyle | undefined>(node.props.style as ViewStyle | undefined)?.outlineWidth === 2)
    expect(indicators()).toHaveLength(1)
    TestRenderer.act(() => date.props.onBlur({ target: 1, currentTarget: 1 }))
    expect(indicators()).toHaveLength(0)
    TestRenderer.act(() => renderer.unmount())
  })

  it.each([412, 1024, 1280])('opens search from the native header at %i dp', (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    props.onSearch.mockClear()

    const renderer = renderControl()
    const search = button(renderer, 'Search')
    if (!search) throw new Error('Search control did not render')
    TestRenderer.act(() => search.props.onPress())
    expect(props.onSearch).toHaveBeenCalledOnce()
    TestRenderer.act(() => renderer.unmount())
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  })
  it('keeps the full date accessible without truncating its labels', () => {
    const renderer = renderControl()
    const date = renderer.root.find((node: { type: unknown; props: Record<string, unknown> }) => node.type === Pressable && node.props.accessibilityLabel === 'Wednesday, 08/04/2026, Go to today')
    const labels = date.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && (node.props.children === 'Wednesday' || node.props.children === '08/04/2026'))
    expect(labels).toHaveLength(2)
    for (const label of labels) expect(label.props.numberOfLines).toBeUndefined()
  })
  it('gives the arrows, date label, and menu control pressed feedback', () => {
    const renderer = renderControl()

    for (const label of ['Previous day', 'Next day', 'List options', 'Wednesday, 08/04/2026, Go to today']) {
      const control = button(renderer, label)
      if (!control) throw new Error(`${label} control did not render`)
      const idle = StyleSheet.flatten(control.props.style({ pressed: false })) as Record<string, unknown>
      const pressed = StyleSheet.flatten(control.props.style({ pressed: true })) as Record<string, unknown>
      expect(idle.backgroundColor).toBeUndefined()
      expect(pressed.backgroundColor).toBe('rgba(250,250,250,0.13)')
    }

    const today = button(renderer, 'Wednesday, 08/04/2026, Go to today')
    if (!today) throw new Error('Today control did not render')
    const next = button(renderer, 'Next day')
    expect(next.parent.findAllByType(Pressable)).toContain(today)
    TestRenderer.act(() => today.props.onPress())
    expect(callbacks.onGoToToday).toHaveBeenCalledOnce()
  })

  it('uses the list options glyph and title', () => {
    const renderer = renderControl()
    const control = button(renderer, 'List options')
    if (!control) throw new Error('List options control did not render')
    expect(control.findAllByType(MoreVertical)).toHaveLength(1)
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
      menuHeading: ptBr.common.options,
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
    expect(menu.props.title).toBe(ptBr.habits.listOptions)
    expect(menu.props.open).toBe(true)
    expect(menu.props.items.map(({ label, icon }: { label: string; icon?: string }) => [label, icon])).toEqual([
      [ptBr.common.select, 'checkbox'],
      [labels.collapseAll, 'chevrons-up'],
      [labels.refresh, 'refresh'],
      [labels.showCompleted, 'eye'],
      [ptBr.habits.frequencyFilter, 'adjustments-horizontal'],
    ])
    TestRenderer.act(() => renderer.update(<TodayDateControl {...props} {...controlProps} allCollapsed showCompleted collapseLabel={labels.expandAll} completedLabel={labels.hideCompleted} />))
    expect(renderer.root.findByType(Menu).props.items.map(({ label, icon }: { label: string; icon?: string }) => [label, icon])).toEqual([
      [ptBr.common.select, 'checkbox'],
      [labels.expandAll, 'chevrons-down'],
      [labels.refresh, 'refresh'],
      [labels.hideCompleted, 'eye-off'],
      [ptBr.habits.frequencyFilter, 'adjustments-horizontal'],
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

  it('uses display type and centred alignment for the date', () => {
    const renderer = renderControl()
    const date = renderer.root.find((node: { type: unknown; props: Record<string, unknown> }) => node.type === Pressable && node.props.accessibilityLabel === 'Wednesday, 08/04/2026, Go to today')
    expect(StyleSheet.flatten(date.props.style({ pressed: false }))).toHaveProperty('alignItems', 'center')
    expect(StyleSheet.flatten(date.props.style({ pressed: false }))).toMatchObject({ flexGrow: 1, flexShrink: 1 })
    const row = renderer.root.findByProps({ testID: 'today-date-row' })
    expect(StyleSheet.flatten(row.props.style).flexWrap).toBeUndefined()
    const day = date.findAllByType(Text)[0]
    expect(StyleSheet.flatten(day.props.style)).toMatchObject({ fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22 })
  })

  it.each([1, 2].flatMap((fontScale) => [320, 384, 412].map((width) => ({ fontScale, width }))))('centres the date between edge controls at $width dp and $fontScale text scale', ({ fontScale, width }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    const numericDate = fontScale === 1 ? formatLocaleDayMonth('2026-09-30', 'pt-BR') : '8 abr.'
    const renderer = renderControl({ dayName: 'Quarta-feira', shortDayName: 'Qua.', numericDate })
    const date = renderer.root.find((node: { type: unknown; props: Record<string, unknown> }) => node.type === Pressable && node.props.accessibilityLabel === `Quarta-feira, ${numericDate}, Go to today`)
    const dateStyle = StyleSheet.flatten(date.props.style({ pressed: false }))
    const rowStyle = StyleSheet.flatten(renderer.root.findByProps({ testID: 'today-date-row' }).props.style)
    const rowWidth = width - 32
    const day = width / fontScale < 240 ? 'Qua.' : 'Quarta-feira'
    const dayWidth = measuredTextWidth(day, 'Space Grotesk', 22,
      require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')) * fontScale
    const numericWidth = measuredTextWidth(numericDate, 'Geist Mono', 12,
      require.resolve('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf')) * fontScale
    const layout = Yoga.Node.create()
    try {
      layout.setWidth(rowWidth)
      layout.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
      layout.setAlignItems(Yoga.ALIGN_CENTER)
      layout.setMinHeight(rowStyle.minHeight)
      layout.setPadding(Yoga.EDGE_TOP, rowStyle.paddingVertical)
      layout.setPadding(Yoga.EDGE_BOTTOM, rowStyle.paddingVertical)
      layout.setGap(Yoga.GUTTER_ALL, rowStyle.gap)
      for (const [index, childWidth] of [48, Math.max(dayWidth, numericWidth), 48].entries()) {
        const node = Yoga.Node.create()
        node.setWidth(childWidth)
        node.setHeight(48)
        node.setFlexGrow(index === 1 ? dateStyle.flexGrow : 0)
        node.setFlexShrink(index === 1 ? dateStyle.flexShrink : 0)
        layout.insertChild(node, layout.getChildCount())
      }
      layout.calculateLayout(rowWidth, 'auto', Yoga.DIRECTION_LTR)
      for (let index = 0; index < 3; index += 1) {
        const bounds = layout.getChild(index).getComputedLayout()
        expect(bounds.top).toBeGreaterThanOrEqual(4)
        expect(layout.getComputedLayout().height - bounds.top - bounds.height).toBeGreaterThanOrEqual(4)
        expect(bounds.left + bounds.width).toBeLessThanOrEqual(rowWidth)
      }
      const previous = layout.getChild(0).getComputedLayout()
      const title = layout.getChild(1).getComputedLayout()
      const next = layout.getChild(2).getComputedLayout()
      expect(previous.left).toBe(0)
      expect(next.left + next.width).toBe(rowWidth)
      expect(Math.abs(title.left + title.width / 2 - rowWidth / 2)).toBeLessThanOrEqual(1)
      expect(title.width).toBeGreaterThanOrEqual(Math.max(dayWidth, numericWidth))
      for (const label of date.findAllByType(Text)) {
        expect(StyleSheet.flatten(label.props.style).textAlign).toBe('center')
      }
      const header = renderer.root.find((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'today-header-actions')
      expect(StyleSheet.flatten(header.props.style)).toMatchObject({ minHeight: 48, gap: 4, flexWrap: 'wrap' })
      const cluster = button(renderer, 'Search')!.parent
      expect(StyleSheet.flatten(cluster.props.style)).toMatchObject({ flexDirection: 'row', gap: 4, flexShrink: 0 })
      expect(3 * 48 + 2 * 4).toBeLessThanOrEqual(rowWidth)
    } finally {
      layout.freeRecursive()
      TestRenderer.act(() => renderer.unmount())
      __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
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

vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))

it('separates the header actions from the grouped date arrows', () => {
  const renderer = renderControl()
  const previous = button(renderer, 'Previous day')!
  const search = button(renderer, 'Search')!
  expect(previous.parent).not.toBe(search.parent)
  expect(previous.parent.findAllByType(Pressable)).toHaveLength(3)
  expect(renderer.root.findAllByType(Pressable).filter((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === ptBr.notifications.bell)).toHaveLength(1)
})

it('pins one header in the owning shell and clears it when Hoje loses focus', () => {
  let renderer: ReturnType<typeof TestRenderer.create>
  const shell = (active: boolean) => <Shell412 tabBar={<Text>Tabs</Text>}><TodayDateControl {...props} headerActive={active} /></Shell412>
  TestRenderer.act(() => { renderer = TestRenderer.create(shell(true)) })
  const header = renderer!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'shell-header')[0]
  const scroller = renderer!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'shell-scroller')[0]
  expect(header.findAllByType(Pressable).some((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Search')).toBe(true)
  expect(scroller.findAllByType(Pressable).some((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Search')).toBe(false)
  expect(scroller.findAllByType(Pressable).some((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Next day')).toBe(true)
  TestRenderer.act(() => renderer!.update(shell(false)))
  expect(renderer!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === 'shell-header')).toHaveLength(0)
  TestRenderer.act(() => renderer!.unmount())
})

it.each([false, true])('keeps the open Portuguese menu labels inside 320 dp at 200 percent, completed=%s', (showCompleted) => {
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
  const renderer = renderControl({ moreLabel: ptBr.habits.listOptions, menuHeading: ptBr.common.options, selectLabel: ptBr.common.select,
    collapseLabel: ptBr.habits.collapseAll, refreshLabel: ptBr.habits.refresh,
    completedLabel: showCompleted ? ptBr.habits.hideCompletedMenu : ptBr.habits.showCompletedMenu, showCompleted })
  try {
    TestRenderer.act(() => button(renderer, ptBr.habits.listOptions)!.props.onPress())
    const menu = renderer.root.findByType(Menu)
    expect(measuredTextWidth(menu.props.shortTitle, 'Geist', 44,
      require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'))).toBeLessThanOrEqual(320 - 2 * 24 - 16 - 48)
    for (const item of menu.props.items) {
      const text = renderer.root.findAllByType(Text).find((node: { props: Record<string, unknown> }) => node.props.children === item.label)!
      const fontSize = StyleSheet.flatten(text.props.style).fontSize
      expect(text.props.numberOfLines).toBeUndefined()
      for (const word of item.label.split(' ')) {
        const measured = measuredTextWidth(word, 'Geist', fontSize * 2,
          require.resolve('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'))
        expect(measured).toBeLessThanOrEqual(320 - 2 * 24 - 2 * 12 - 20 - 12)
      }
    }
  } finally {
    TestRenderer.act(() => renderer.unmount())
    __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  }
})
