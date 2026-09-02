import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import {
  goalListCardFixture as goals,
  habitListCardFixture as habits,
} from '@orbit/shared/test-support/chat-fixtures'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { HabitListCard } from '@/components/chat/habit-list-card'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  occurrencesById: new Map<string, { isCompleted: boolean; isLoggedInRange: boolean }>(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { habitsById: mocks.occurrencesById } }),
  useLogHabit: () => ({ mutate: mocks.mutate }),
}))
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

describe('Astra list cards on web', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.occurrencesById.clear()
    for (const item of habits.items) {
      mocks.occurrencesById.set(item.id, { isCompleted: false, isLoggedInRange: false })
    }
  })

  it('logs from authoritative occurrence state, opens the habit, and pages the count', () => {
    render(<HabitListCard habitList={habits} />)

    expect(screen.getByText('chat.habitList.count:{"shown":3,"total":4}')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.open.*Water/ }))
    expect(mocks.push).toHaveBeenCalledWith('/habits/habit-1')

    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.log.*Water/ }))
    expect(mocks.mutate).toHaveBeenNthCalledWith(1, { habitId: 'habit-1' })

    fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.more' }))
    expect(screen.getByText('chat.habitList.count:{"shown":4,"total":4}')).toBeInTheDocument()
  })

  it('announces unlog for an already-completed occurrence', () => {
    mocks.occurrencesById.set('habit-1', { isCompleted: true, isLoggedInRange: true })
    render(<HabitListCard habitList={habits} />)

    fireEvent.click(screen.getByRole('button', { name: /chat\.habitList\.unlog.*Water/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ habitId: 'habit-1' })
  })

  it('withholds the toggle when the occurrence is not authoritative', () => {
    mocks.occurrencesById.delete('habit-1')
    render(<HabitListCard habitList={habits} />)

    expect(screen.queryByRole('button', { name: /chat\.habitList\.(?:log|unlog).*Water/ })).not.toBeInTheDocument()
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
