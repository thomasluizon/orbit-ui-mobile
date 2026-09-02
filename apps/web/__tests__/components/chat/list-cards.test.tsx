import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import type { GoalListCard as GoalListData, HabitListCard as HabitListData } from '@orbit/shared/types/chat'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { HabitListCard } from '@/components/chat/habit-list-card'

const mocks = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn() }))

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.mutate }) }))
vi.mock('@/components/ui/status-ring', () => ({ StatusRing: () => <span /> }))
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: () => <span /> }))
vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: ({ title, count, items, actions }: BlockFrameProps) => <section>
    <h2>{title}</h2>
    <p>{count}</p>
    {items.map((item) => <div key={item.id}>{item.label}{item.meta}{item.control}</div>)}
    {actions}
  </section>,
}))

const habits: HabitListData = {
  scope: 'today',
  items: ['Water', 'Walk', 'Read', 'Stretch'].map((title, index) => ({
    id: `habit-${index + 1}`,
    title,
    depth: 0,
    isBadHabit: false,
    status: 'today',
  })),
}

const goals: GoalListData = {
  items: [{ id: 'goal-1', title: 'Run 10 km', current: 4, target: 10, unit: 'km' }],
}

describe('Astra list cards on web', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs and unlogs locally, opens the habit, and pages the count without an AI call', () => {
    render(<HabitListCard habitList={habits} />)

    expect(screen.getByText('chat.habitList.count:{"shown":3,"total":4}')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.open.*Water/ }))
    expect(mocks.push).toHaveBeenCalledWith('/habits/habit-1')

    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.log.*Water/ }))
    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.unlog.*Water/ }))
    expect(mocks.mutate).toHaveBeenNthCalledWith(1, { habitId: 'habit-1' })
    expect(mocks.mutate).toHaveBeenNthCalledWith(2, { habitId: 'habit-1' })

    fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.more' }))
    expect(screen.getByText('chat.habitList.count:{"shown":4,"total":4}')).toBeInTheDocument()
  })

  it('opens a goal row in place and routes the progress action', () => {
    const onOpenGoal = vi.fn()
    render(<GoalListCard goalList={goals} onOpenGoal={onOpenGoal} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run 10 km' }))
    expect(onOpenGoal).toHaveBeenCalledWith('goal-1')
    fireEvent.click(screen.getByRole('button', { name: 'chat.goalList.progressLink' }))
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })
})
