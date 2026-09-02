import { Pressable, StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { TodayDateControl } from '@/components/today/today-date-control'

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
  nextLabel: 'Next day',
  moreLabel: 'More actions',
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
  it('gives the arrows, jump action, and menu control pressed feedback', () => {
    const renderer = renderControl()

    for (const label of ['Previous day', 'Next day', 'More actions']) {
      const control = button(renderer, label)
      if (!control) throw new Error(`${label} control did not render`)
      const idle = StyleSheet.flatten(control.props.style({ pressed: false })) as Record<string, unknown>
      const pressed = StyleSheet.flatten(control.props.style({ pressed: true })) as Record<string, unknown>
      expect(idle.backgroundColor).toBeUndefined()
      expect(pressed.backgroundColor).toBe('rgba(250,250,250,0.14)')
    }

    const today = renderer.root.findAllByType(Pressable)[1]
    if (!today) throw new Error('Today control did not render')
    const pressedToday = StyleSheet.flatten(today.props.style({ pressed: true })) as Record<string, unknown>
    expect(pressedToday.backgroundColor).toBe('rgba(250,250,250,0.14)')
    TestRenderer.act(() => today.props.onPress())
    expect(callbacks.onGoToToday).toHaveBeenCalledOnce()
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
