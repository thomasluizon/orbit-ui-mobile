import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { GoalLinkingField } from '@/components/habits/goal-linking-field'
import { useUIStore } from '@/stores/ui-store'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('GoalLinkingField', () => {
  beforeEach(() => {
    useUIStore.getState().setShowCreateGoalModal(false)
  })
  it('renders label', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByText('habits.form.goals')).toBeInTheDocument()
  })

  it('shows no goals message when empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    await waitFor(() => {
      expect(screen.getByText('habits.form.noGoals')).toBeInTheDocument()
    })
  })

  it('renders active goals as buttons', async () => {
    const goals = [
      { id: 'g1', title: 'Run 100km', status: 'Active', progressPercentage: 50, targetValue: 100, unit: 'km', currentValue: 50 },
      { id: 'g2', title: 'Completed Goal', status: 'Completed', progressPercentage: 100, targetValue: 10, unit: 'books', currentValue: 10 },
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(goals),
    })

    const onToggleGoal = vi.fn()
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={onToggleGoal}
      />,
      { wrapper: createWrapper() },
    )

    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    await waitFor(() => {
      expect(screen.getByText(/Run 100km/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Completed Goal/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Run 100km/))
    expect(onToggleGoal).toHaveBeenCalledWith('g1')
  })

  it('retires the empty picker before opening goal creation and can reopen it', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    render(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      { wrapper: createWrapper() },
    )

    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'habits.form.createGoal' }))

    await waitFor(() => expect(screen.queryByText('habits.form.noGoals')).not.toBeInTheDocument())
    expect(useUIStore.getState().showCreateGoalModal).toBe(true)

    useUIStore.getState().setShowCreateGoalModal(false)
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    expect(await screen.findByText('habits.form.noGoals')).toBeInTheDocument()
  })

  it('windows a large goal collection and keeps search above the scrolling list', async () => {
    const goals = Array.from({ length: 50 }, (_, index) => ({
      id: `g${index}`,
      title: `Goal ${index}`,
      status: 'Active',
      progressPercentage: index,
      targetValue: 100,
      unit: 'times',
      currentValue: index,
    }))
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(goals) })

    render(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      { wrapper: createWrapper() },
    )
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))

    const search = await screen.findByPlaceholderText('habits.form.searchGoals')
    expect(screen.getByText('habits.form.availableCount')).toBeInTheDocument()
    expect(screen.queryByText('Goal 20')).not.toBeInTheDocument()

    fireEvent.scroll(search.nextElementSibling!, { target: { scrollTop: 20 * 48 } })
    expect(await screen.findByText('Goal 20')).toBeInTheDocument()
  })
})
