import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

const routerPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const listGoal = createMockGoal({ id: '1', title: 'Read 12 books', currentValue: 3, targetValue: 12, unit: 'books', progressPercentage: 25 })

let detailGoal: GoalDetailWithMetrics['goal'] = { ...listGoal, progressHistory: [] }
let detailLoadError = false
const refetchDetail = vi.fn()
const updateStatusMutateAsync = vi.fn()
const updateProgressMutateAsync = vi.fn()
const deleteMutateAsync = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: {
      allGoals: [listGoal],
      goalsById: new Map([['1', listGoal]]),
    },
  }),
  useGoalDetail: (id: string | null) => ({
    data: id ? { goal: detailGoal, metrics: { progressPercentage: detailGoal.progressPercentage, velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline', habitAdherence: [] } } : null,
    isLoading: false,
    isError: detailLoadError,
    refetch: refetchDetail,
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: updateProgressMutateAsync, isPending: false, error: null }),
  useUpdateGoalStatus: () => ({
    mutateAsync: updateStatusMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteGoal: () => ({ mutateAsync: deleteMutateAsync, isPending: false, error: null }),
}))

vi.mock('@/components/goals/edit-goal-modal', () => ({
  EditGoalModal: () => null,
}))

vi.mock('@/components/goals/goal-metrics-panel', () => ({
  GoalMetricsPanel: () => React.createElement('div', { 'data-testid': 'metrics-panel' }),
}))

import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

describe('GoalDetailDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    detailGoal = { ...listGoal, progressHistory: [] }
    detailLoadError = false
    refetchDetail.mockClear()
    updateStatusMutateAsync.mockClear()
    updateProgressMutateAsync.mockClear()
    deleteMutateAsync.mockClear()
    routerPush.mockClear()
    useChatStore.setState({ draft: '', draftHydrated: true })
    useUIStore.setState({ astraConversationOpen: false })
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <GoalDetailDrawer open={false} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders goal title when open', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(screen.getByText('Read 12 books')).toBeInTheDocument()
  })

  it('keeps the linked habits section visible at count zero', () => {
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByText('goals.linkedHabits')).toBeInTheDocument()
    expect(screen.getByText('goals.noLinkedHabits')).toBeInTheDocument()
  })

  it.each([
    { name: 'renders progress section', text: 'goals.progress' },
    { name: 'renders progress info text', text: 'progressScreen.goals.progress' },
    { name: 'renders manual progress controls for active goals', text: 'goals.detail.manualProgress' },
    { name: 'renders edit action', text: 'goals.detail.edit' },
    { name: 'renders mark abandoned action for active goals', text: 'goals.detail.markAbandoned' },
    { name: 'renders delete action', text: 'goals.detail.delete' },
  ])('$name', ({ text }) => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain(text)
  })



  it('prefers synced detail data over the stale list cache', () => {
    detailGoal = {
      ...listGoal,
      title: 'Read 12 books (synced)',
      currentValue: 6,
      progressPercentage: 50,
      progressHistory: [],
    }

    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )

    expect(screen.getByText('Read 12 books (synced)')).toBeInTheDocument()
    expect(document.body.textContent).toContain('"current":6')
  })



  it('does not offer or submit manual progress for a derived goal', () => {
    detailGoal = {
      ...listGoal,
      isProgressDerived: true,
      progressHistory: [],
    }

    render(
      <GoalDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        goalId="1"
        initialAction="progress"
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'goals.updateProgress' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.save' }),
    ).not.toBeInTheDocument()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it('marks the goal completed once for the complete initial action', () => {
    render(
      <GoalDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        goalId="1"
        initialAction="complete"
      />,
    )
    expect(updateStatusMutateAsync).toHaveBeenCalledTimes(1)
    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Completed' },
      goalName: 'Read 12 books',
    })
  })

  it('offers a retry action when the detail fetch fails', () => {
    detailLoadError = true
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.loadError')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('abandons an active goal from the action footer', () => {
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.markAbandoned' }))

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Abandoned' },
      goalName: 'Read 12 books',
    })
  })

  it('deletes the goal after confirming and closes the drawer', async () => {
    deleteMutateAsync.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    render(<GoalDetailDrawer open={true} onOpenChange={onOpenChange} goalId="1" />)

    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'goals.detail.delete' }).at(-1)!)

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith('1'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })






  it.each(['Standard', 'Streak'] as const)('stage 5 names derived progress for %s and hides steppers', (type) => {
    detailGoal = { ...listGoal, type, isProgressDerived: true, linkedHabits: [{ id: 'h1', title: 'Read nightly' }], progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.derived')
    const label = 'goals.detail.increase'
    expect(screen.queryByRole('button', { name: label })).toBeFalsy()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it.each([false, undefined])('stage 5 steps manual progress when derived is %s', (isProgressDerived) => {
    detailGoal = { ...listGoal, type: 'Streak', isProgressDerived, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.manualProgress')
    const label = 'goals.detail.increase'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(updateProgressMutateAsync).toHaveBeenCalledWith({ goalId: '1', data: { currentValue: 4 } })
  })

  it('stage 5 completes only at target with a neutral action and explanation', () => {
    detailGoal = { ...listGoal, currentValue: 12, progressPercentage: 100, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.completeWhy')
    const label = 'goals.detail.markCompleted'
    const complete = screen.queryByRole('button', { name: label })
    expect(complete).toBeTruthy()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'goals.progressPercentage:{"pct":100}' })).toHaveAttribute('data-status', 'done')
    expect(complete).toHaveAttribute("data-variant", "secondary")
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(updateStatusMutateAsync).toHaveBeenCalledWith({ goalId: '1', data: { status: 'Completed' }, goalName: listGoal.title })
  })

  it.each(['Active', 'Completed'] as const)('stage 5 never reopens a %s goal', (status) => {
    detailGoal = { ...listGoal, status, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const label = 'goals.detail.reactivate'
    expect(screen.queryByRole('button', { name: label })).toBeFalsy()
    expect(document.body.textContent).not.toContain('goals.detail.markCompleted')
  })

  it('stage 5 removes the figure and ring from an abandoned goal', () => {
    detailGoal = { ...listGoal, status: 'Abandoned', progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).not.toContain('"current":3')
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    const label = 'goals.detail.reactivate'
    expect(screen.queryByRole('button', { name: label })).toBeTruthy()
  })

  it('stage 5 shows capacity and the newest three history rows before expanding', () => {
    detailGoal = { ...listGoal, linkedHabits: Array.from({ length: 20 }, (_, index) => ({ id: String(index), title: `Habit ${index}` })), progressHistory: [4, 3, 2, 1].map(value => ({ createdAtUtc: `2026-09-0${value}T00:00:00Z`, previousValue: value - 1, value, note: `entry-${value}` })) }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.linkedLimit')
    expect(document.body.textContent).toContain('entry-4')
    expect(document.body.textContent).not.toContain('entry-1')
    let label = 'goals.detail.showAllHistory:{"count":4}'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(document.body.textContent).toContain('entry-1')
    label = 'goals.detail.showLessHistory'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(document.body.textContent).not.toContain('entry-1')
  })

  it('stage 5 names the goal in deletion confirmation before any write', () => {
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const label = 'goals.detail.delete'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(document.body.textContent).toContain('goals.detail.deleteNamed:{"title":"Read 12 books"}')
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })

  it('stage 5 keeps failed progress unchanged and allows retry', async () => {
    updateProgressMutateAsync.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const increase = screen.getByRole('button', { name: 'goals.detail.increase' })
    fireEvent.click(increase)
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toBe(''))
    expect(document.body.textContent).toContain('"current":3')
    fireEvent.click(increase)
    await waitFor(() => expect(updateProgressMutateAsync).toHaveBeenCalledTimes(2))
  })

  it('stage 5 bounds the stepper and blocks duplicate pending writes', async () => {
    detailGoal = { ...listGoal, currentValue: 0, progressPercentage: 0, progressHistory: [] }
    let resolve: () => void = () => {}
    updateProgressMutateAsync.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByRole('button', { name: 'goals.detail.decrease' })).toBeDisabled()
    const increase = screen.getByRole('button', { name: 'goals.detail.increase' })
    fireEvent.click(increase)
    fireEvent.click(increase)
    expect(updateProgressMutateAsync).toHaveBeenCalledTimes(1)
    expect(increase).toBeDisabled()
    resolve()
    await waitFor(() => expect(increase).not.toBeDisabled())
  })

  it('stage 5 focuses inline detail and restores the opening control on back', async () => {
    function Host() {
      const [open, setOpen] = React.useState(false)
      return <><button onClick={() => setOpen(true)}>Open goal</button>{open ? <GoalDetailDrawer inline open onOpenChange={setOpen} goalId="1" /> : null}</>
    }
    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open goal' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toHaveAttribute('data-goal-detail')
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

})
