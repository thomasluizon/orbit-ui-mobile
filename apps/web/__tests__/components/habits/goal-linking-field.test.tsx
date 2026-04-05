import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { GoalLinkingField } from '@/components/habits/goal-linking-field'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('GoalLinkingField', () => {
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

    await waitFor(() => {
      expect(screen.getByText(/Run 100km/)).toBeInTheDocument()
    })
    // Completed goal should not appear (only Active)
    expect(screen.queryByText(/Completed Goal/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Run 100km/))
    expect(onToggleGoal).toHaveBeenCalledWith('g1')
  })
})
