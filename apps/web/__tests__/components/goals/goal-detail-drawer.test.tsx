import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

const listGoal = {
  id: '1',
  title: 'Read 12 books',
  description: null,
  targetValue: 12,
  currentValue: 3,
  unit: 'books',
  status: 'Active',
  deadline: null,
  position: 0,
  createdAtUtc: '2025-01-01T00:00:00Z',
  completedAtUtc: null,
  progressPercentage: 25,
  linkedHabits: [],
}

let detailGoal = { ...listGoal, progressHistory: [] as Array<unknown> }
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
    data: id ? { goal: detailGoal, metrics: null } : null,
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
    localStorage.clear()
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

  it.each([
    { name: 'renders progress section', text: 'goals.progress' },
    { name: 'renders progress info text', text: 'goals.progressOf' },
    { name: 'renders update progress button for active goals', text: 'goals.updateProgress' },
    { name: 'renders edit action', text: 'goals.detail.edit' },
    { name: 'renders mark completed action for active goals', text: 'goals.detail.markCompleted' },
    { name: 'renders mark abandoned action for active goals', text: 'goals.detail.markAbandoned' },
    { name: 'renders delete action', text: 'goals.detail.delete' },
  ])('$name', ({ text }) => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain(text)
  })

  it('renders metrics panel for active goals', () => {
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument()
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

  it('opens straight into the progress form for the progress initial action', () => {
    render(
      <GoalDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        goalId="1"
        initialAction="progress"
      />,
    )
    expect(document.body.textContent).toContain('common.save')
    expect(document.body.textContent).not.toContain('goals.updateProgress')
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
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith('1'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('submits a progress update from the inline form', async () => {
    updateProgressMutateAsync.mockResolvedValue(undefined)
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" initialAction="progress" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(updateProgressMutateAsync).toHaveBeenCalledTimes(1))
  })

  it('reactivates a completed goal instead of showing active-only actions', () => {
    detailGoal = { ...listGoal, status: 'Completed', progressHistory: [] }
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.queryByRole('button', { name: 'goals.detail.markCompleted' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.reactivate' }))
    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Active' },
      goalName: 'Read 12 books',
    })
  })

  it('seeds an Astra chat draft and navigates when Ask Astra is used', () => {
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    fireEvent.click(screen.getByRole('button', { name: /goals\.detail\.askAstra/ }))

    expect(routerPush).toHaveBeenCalledWith('/chat')
    expect(localStorage.getItem('orbit-chat-draft')).toContain('goals.detail.askAstraSeedDefault')
  })
})
