import { Pressable, StyleSheet, Text, View } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { AdjustmentsHorizontal } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { TodayDateControl } from '@/components/today/today-date-control'

const windowState = vi.hoisted(() => ({ width: 320 }))
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => ({ width: windowState.width, height: 800, scale: 1, fontScale: 1 }),
}))

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
  refreshLabel: 'Refresh',
  completedLabel: 'Show completed',
  isFetching: false,
  ...callbacks,
}


function renderControl() {
  let renderer: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<TodayDateControl {...props} />)
  })
  return renderer!
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

  it('uses display type and leading alignment for the date', () => {
    const renderer = renderControl()
    const date = renderer.root.find((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Wednesday, 08/04/2026')
    expect(StyleSheet.flatten(date.props.style)).not.toHaveProperty('alignItems', 'center')
    expect(StyleSheet.flatten(date.props.style)).toHaveProperty('minWidth', 150)
    const row = date.parent
    expect(StyleSheet.flatten(row.props.style)).toHaveProperty('flexWrap', 'wrap')
    const day = date.findAllByType(Text)[0]
    expect(StyleSheet.flatten(day.props.style)).toMatchObject({ fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22 })
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
