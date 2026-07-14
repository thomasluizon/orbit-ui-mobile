import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoalStatusActions } from '@/components/goals/goal-detail-drawer/use-goal-status-actions'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  showError: vi.fn(),
}))

vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoalStatus: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.isPending }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

type StatusApi = ReturnType<typeof useGoalStatusActions>

function renderActions(refetchDetail = vi.fn()) {
  const ref: { current: StatusApi | null } = { current: null }

  function Harness() {
    ref.current = useGoalStatusActions({
      goalId: 'goal-1',
      goalName: 'Read 12 books',
      refetchDetail,
    })
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  if (!ref.current) throw new Error('useGoalStatusActions did not render')
  return { api: ref as { current: StatusApi }, refetchDetail }
}

async function act(action: () => void | Promise<void>) {
  await TestRenderer.act(async () => {
    await action()
  })
}

describe('mobile useGoalStatusActions', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.isPending = false
    mocks.showError.mockReset()
  })

  it('marks the goal completed and refetches the detail', async () => {
    const { api, refetchDetail } = renderActions()

    await act(() => api.current.markCompleted())

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      goalId: 'goal-1',
      data: { status: 'Completed' },
      goalName: 'Read 12 books',
    })
    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('marks the goal abandoned and refetches the detail', async () => {
    const { api, refetchDetail } = renderActions()

    await act(() => api.current.markAbandoned())

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      goalId: 'goal-1',
      data: { status: 'Abandoned' },
      goalName: 'Read 12 books',
    })
    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('reactivates the goal and refetches the detail', async () => {
    const { api, refetchDetail } = renderActions()

    await act(() => api.current.reactivate())

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      goalId: 'goal-1',
      data: { status: 'Active' },
      goalName: 'Read 12 books',
    })
    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('surfaces a friendly error and skips the refetch when the mutation fails', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('server error'))
    const { api, refetchDetail } = renderActions()

    await act(() => api.current.markCompleted())

    expect(mocks.showError).toHaveBeenCalledWith('goals.errors.update')
    expect(refetchDetail).not.toHaveBeenCalled()
  })

  it('guards every action against a double-submit while a mutation is pending', async () => {
    mocks.isPending = true
    const { api, refetchDetail } = renderActions()

    expect(api.current.isUpdatingStatus).toBe(true)

    await act(() => api.current.markCompleted())
    await act(() => api.current.markAbandoned())
    await act(() => api.current.reactivate())

    expect(mocks.mutateAsync).not.toHaveBeenCalled()
    expect(refetchDetail).not.toHaveBeenCalled()
  })
})
