import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { MetricsCard } from '@/components/chat/metrics-card'

const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { done?: number; scheduled?: number; name?: string }) =>
    key === 'charts.bar.readout' ? `${values?.done} of ${values?.scheduled}` : key === 'chat.metrics.habitTitle' ? `Metrics for ${values?.name}` : key,
    i18n: { language: 'en' } }),
}))

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAllByType(type: string): TestNode[]
}

function render(element: ReactElement): TestNode {
  let tree: { root: TestNode } | undefined
  void act(() => { tree = create(element) as unknown as { root: TestNode } })
  if (!tree) throw new Error('Metrics card did not mount')
  return tree.root
}

const series = (count: number) => ({ granularity: 'day' as const, points: Array.from({ length: count }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  scheduled: 2, completed: 1, completionRate: 50,
})) })
const overview: MetricsCardData = {
  period: 'week', completionRate: 50, totalCompletions: 7, totalScheduled: 14,
  activeDays: 7, currentStreak: 2, bestStreak: 4, hasData: true,
  surfaceId: 'progress', series: series(7), topHabitName: 'Walk',
}

describe('Astra metrics card on mobile', () => {
  it('renders three rows, seven bars and routes to Progress', () => {
    push.mockClear()
    const root = render(<MetricsCard metricsCard={overview} />)
    const control = root.findByProps({ testID: 'bar-chart-control' })
    void act(() => { (control.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 320 } } }) })
    expect(root.findAllByType('Path')).toHaveLength(7)
    expect(root.findByProps({ testID: 'block-frame-item-completionRate-pending' })).toBeDefined()
    expect(root.findByProps({ testID: 'block-frame-item-activeDays-pending' })).toBeDefined()
    expect(root.findByProps({ testID: 'block-frame-item-topHabit-pending' })).toBeDefined()
    const button = root.findByProps({ testID: 'button-ghost-sm' })
    ;(button.props.onPress as () => void)()
    expect(push).toHaveBeenCalledWith('/progress')
  })

  it('renders thirty habit bars and routes to the habit', () => {
    push.mockClear()
    const habitId = '92ca0543-c3e1-4f41-9370-c55e1bfa8157'
    const root = render(<MetricsCard metricsCard={{ ...overview, habitId, habitTitle: 'Walk', monthlyCompletionRate: 60, series: series(30) }} />)
    const control = root.findByProps({ testID: 'bar-chart-control' })
    void act(() => { (control.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 320 } } }) })
    expect(root.findAllByType('Path')).toHaveLength(30)
    const button = root.findByProps({ testID: 'button-ghost-sm' })
    ;(button.props.onPress as () => void)()
    expect(push).toHaveBeenCalledWith({ pathname: '/habits/[id]', params: { id: habitId } })
  })

  it('keeps a long habit title readable', () => {
    const root = render(<MetricsCard metricsCard={{ ...overview, habitId: '92ca0543-c3e1-4f41-9370-c55e1bfa8157', habitTitle: 'A very long walking habit name that must remain readable' }} />)
    const title = root.findAllByType('Text').find((node) => typeof node.props.children === 'string' && node.props.children.includes('A very long walking habit name'))
    expect(title).toBeDefined()
    expect(title?.props.numberOfLines).toBeUndefined()
  })
})
