import { personalText } from '@/__tests__/support/personal-text'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal } from '@orbit/shared/types/goal'
import React from 'react'

vi.mock('@/components/habits/create-goal-from-habit-sheet', () => ({
  CreateGoalFromHabitSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button type="button" onClick={onClose}>contextual-goal-creator</button> : null,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/api-fetch', () => ({ fetchJson: vi.fn() }))

import { GoalLinkingField } from '@/components/habits/goal-linking-field'
import { fetchJson } from '@/lib/api-fetch'

const mockFetchJson = vi.mocked(fetchJson)
let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('GoalLinkingField', () => {
  beforeEach(() => {
    mockFetchJson.mockReset()
    mockFetchJson.mockResolvedValue([])
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    cleanup()
    queryClient.clear()
  })

  it('renders label', () => {
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText('habits.form.goals')).toBeInTheDocument()
  })

  it('shows no goals message when empty', async () => {
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    await waitFor(() => {
      expect(screen.getByText('habits.form.noGoals')).toBeInTheDocument()
    })
  })

  it('renders active goals as buttons', async () => {
    const goals = [
      createMockGoal({ id: 'g1', title: 'Run 100km', status: 'Active', progressPercentage: 50, targetValue: 100, unit: 'km', currentValue: 50 }),
      createMockGoal({ id: 'g2', title: 'Completed Goal', status: 'Completed', progressPercentage: 100, targetValue: 10, unit: 'books', currentValue: 10 }),
    ]
    mockFetchJson.mockResolvedValue(goals)

    const onToggleGoal = vi.fn()
    render(
      <GoalLinkingField
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={onToggleGoal}
      />,
      { wrapper: Wrapper },
    )

    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    const activeGoal = await screen.findByRole('button', { name: /Run 100km/, pressed: false })
    expect(activeGoal).toBeEnabled()
    expect(activeGoal).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /Completed Goal/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Completed Goal/)).not.toBeInTheDocument()

    fireEvent.click(activeGoal)
    expect(onToggleGoal).toHaveBeenCalledWith('g1')
  })

  it('renders selectable active goals when the response settles after opening the picker', async () => {
    let finishRequest!: (response: { items: Goal[] }) => void
    mockFetchJson.mockReturnValueOnce(new Promise<{ items: Goal[] }>((resolve) => { finishRequest = resolve }))
    const onToggleGoal = vi.fn()
    render(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={onToggleGoal} />,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    expect(screen.getByText('habits.form.noGoals')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Run 100km/, pressed: false })).not.toBeInTheDocument()

    await act(async () => {
      finishRequest({ items: [
        createMockGoal({ id: 'g1', title: 'Run 100km' }),
        createMockGoal({ id: 'g2', title: 'Completed Goal', status: 'Completed' }),
      ] })
    })

    const activeGoal = await screen.findByRole('button', { name: /Run 100km/, pressed: false })
    expect(activeGoal).toBeEnabled()
    expect(screen.queryByText('habits.form.noGoals')).not.toBeInTheDocument()
    expect(screen.queryByText('Completed Goal')).not.toBeInTheDocument()
    fireEvent.click(activeGoal)
    expect(onToggleGoal).toHaveBeenCalledWith('g1')
  })

  it('opens goal creation inside the habit surface and returns to the picker', async () => {
    render(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      { wrapper: Wrapper },
    )

    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'habits.form.createGoal' }))

    await waitFor(() => expect(screen.queryByText('habits.form.noGoals')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'contextual-goal-creator' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'contextual-goal-creator' }))
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    expect(await screen.findByText('habits.form.noGoals')).toBeInTheDocument()
  })

  it('windows a large goal collection and keeps search above the scrolling list', async () => {
    const goals = Array.from({ length: 50 }, (_, index) => createMockGoal({
      id: `g${index}`,
      title: `Goal ${index}`,
      status: 'Active',
      progressPercentage: index,
      targetValue: 100,
      unit: 'times',
      currentValue: index,
    }))
    mockFetchJson.mockResolvedValue(goals)

    render(
      <GoalLinkingField selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} />,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))

    const search = await screen.findByPlaceholderText('habits.form.searchGoals')
    expect(screen.getByText('habits.form.availableCount')).toBeInTheDocument()
    expect(screen.queryByText(personalText('Goal 20'))).not.toBeInTheDocument()

    fireEvent.scroll(search.nextElementSibling!, { target: { scrollTop: 20 * 120 } })
    expect(await screen.findByText(personalText('Goal 20'))).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'Goal 49' } })
    expect(screen.getByText(personalText('Goal 49'))).toBeInTheDocument()
    expect(search.nextElementSibling!.scrollTop).toBe(0)
  })
  it.each(['UnbrokenToken' .repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses typed text without changing selection for %s', async (name) => {
    const onToggle = vi.fn()
    mockFetchJson.mockResolvedValue([createMockGoal({ id: 'long-goal', title: name })])
    render(<GoalLinkingField selectedGoalIds={['long-goal']} atGoalLimit={false} onToggleGoal={onToggle} />, { wrapper: Wrapper })
    const disclosure = await screen.findByRole('button', { name, expanded: false })
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name, expanded: true })).toBeInTheDocument()
    expect(document.querySelector('[data-personal-text-expanded]')).not.toBeNull()
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name, expanded: true }))
    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.goals/ }))
    const row = await screen.findByRole('button', { name, pressed: true })
    const title = row.querySelector('[data-personal-text]')!
    expect(title).toHaveAttribute('aria-label', name)
    expect(title).toHaveStyle({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' })
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledWith('long-goal')
  })

})
