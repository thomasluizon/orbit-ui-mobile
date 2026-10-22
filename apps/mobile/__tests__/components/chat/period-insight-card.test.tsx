import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { PeriodInsightCard } from '@/components/chat/period-insight-card'

const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAllByType(type: string): TestNode[]
}

function render(element: ReactElement): TestNode {
  let tree: { root: TestNode } | undefined
  void act(() => { tree = create(element) as unknown as { root: TestNode } })
  if (!tree) throw new Error('Period insight card did not mount')
  return tree.root
}

const insight: PeriodInsightData = {
  period: 'week', dateFrom: '2026-09-01', dateTo: '2026-09-07', completionRate: 50,
  activeDays: 4, periodDays: 7, totalCompletions: 7, totalScheduled: 14,
  currentStreak: 2, bestStreak: 5,
  topHabits: [{ name: 'Walk', emoji: null, completionRate: 80, completedCount: 4, scheduledCount: 5 }],
  needsAttention: [{ name: 'Read', emoji: null, completionRate: 20, completedCount: 1, scheduledCount: 5 }],
  narrative: { highlights: 'Walked', trends: 'Mornings', suggestion: 'Start small', missed: 'Reading' },
  series: { granularity: 'day', points: Array.from({ length: 7 }, (_, index) => ({
    startDate: `2026-09-0${index + 1}`, endDate: `2026-09-0${index + 1}`,
    scheduled: 2, completed: 1, completionRate: 50,
  })) },
}

describe('period insight card on mobile', () => {
  it('starts with scoped figures and reveals every supplied narrative section', () => {
    const root = render(<PeriodInsightCard periodInsight={insight} />)
    const chart = root.findByProps({ testID: 'bar-chart-control' })
    void act(() => { (chart.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 320 } } }) })
    expect(root.findAllByType('Path')).toHaveLength(7)
    expect(root.findAllByType('Text').some(node => node.props.children === 'Reading')).toBe(false)
    const more = root.findByProps({ accessibilityLabel: 'chat.habitList.more' })
    void act(() => { (more.props.onPress as () => void)() })
    for (const text of ['Walked', 'Mornings', 'Start small', 'Reading']) expect(root.findAllByType('Text').some(node => node.props.children === text)).toBe(true)
    expect(root.findByProps({ testID: 'block-frame-item-attention-0-pending' })).toBeDefined()
    const progress = root.findByProps({ accessibilityLabel: 'chat.insight.progressLink' })
    void act(() => { (progress.props.onPress as () => void)() })
    expect(push).toHaveBeenCalledWith('/progress')
  })

  it('omits a missing chart with empty narrative defaults', () => {
    const root = render(<PeriodInsightCard periodInsight={{ ...insight, series: null, narrative: { highlights: '', trends: '', suggestion: '', missed: '' } }} />)
    expect(root.findAllByType('Path')).toHaveLength(0)
    const more = root.findByProps({ accessibilityLabel: 'chat.habitList.more' })
    void act(() => { (more.props.onPress as () => void)() })
    expect(root.findAllByType('Text').some(node => node.props.children === 'chat.insight.highlights')).toBe(false)
  })
  it('keeps the full habit name available after disclosure', () => {
    const name = 'A very long walking habit name that needs multiple lines to remain readable'
    const root = render(<PeriodInsightCard periodInsight={{ ...insight, needsAttention: [{ ...insight.needsAttention[0]!, name }] }} />)
    const more = root.findByProps({ accessibilityLabel: 'chat.habitList.more' })
    void act(() => { (more.props.onPress as () => void)() })
    const label = root.findAllByType('Text').find(node => node.props.children === `chat.insight.needsAttention: ${name}`)
    expect(label?.props.numberOfLines).toBeUndefined()
  })

})
