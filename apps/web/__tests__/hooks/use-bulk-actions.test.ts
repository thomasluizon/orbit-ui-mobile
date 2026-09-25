import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const showToast = vi.fn()
const showQueued = vi.fn()
const VIEWED_DATE = '2026-04-01'

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast, showQueued }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderBulkActions(
  selectedHabitIds: Set<string>,
  completionReadOnly = false,
  habitsById = new Map<string, NormalizedHabit>(),
  onReadOnlyCommit?: () => void,
) {
  let currentCompletionReadOnly = completionReadOnly
  const onSuccess = vi.fn()
  const onPartialFailure = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>

  const { result, rerender } = renderHook(() => {
    const actions = useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      completionReadOnly: currentCompletionReadOnly,
      habitsById,
      habitListRef,
      onSuccess,
      onPartialFailure,
    })
    useLayoutEffect(() => {
      if (currentCompletionReadOnly) onReadOnlyCommit?.()
    })
    return actions
  })

  return {
    result, onSuccess, onPartialFailure, settleBulkHabitResolutions,
    setCompletionReadOnly(value: boolean) {
      currentCompletionReadOnly = value
      rerender()
    },
  }
}

function bulkSuccess(ids: string[]) {
  return { results: ids.map((habitId) => ({ habitId, status: 'Success' as const })) }
}

/**
 * Ticket #42 is the product authority: a confirmation belongs to an
 * irreversible act only. Bulk log and bulk skip act at once, and only bulk
 * delete asks. These assertions state that requirement rather than inherit it.
 */
describe('useBulkActions reversibility boundary', () => {
  beforeEach(() => {
    showToast.mockReset()
    showQueued.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1']))
    bulkLog.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
    bulkSkip.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disarms the delete confirmation when another account replaces the tab', async () => {
    const { result } = renderBulkActions(new Set(['h-1', 'h-2']))
    act(() => result.current.setShowBulkDeleteConfirm(true))
    expect(result.current.showBulkDeleteConfirm).toBe(true)

    await replaceAccountWith('user-2')

    expect(result.current.showBulkDeleteConfirm).toBe(false)
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
  })

  it('does not apply an old bulk result after another account replaces the tab', async () => {
    let finishLog!: (value: ReturnType<typeof bulkSuccess>) => void
    bulkLog.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { finishLog = resolve }))
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(new Set(['h-1']))
    act(() => { void result.current.confirmBulkLog() })
    expect(bulkLog.mutateAsync).toHaveBeenCalledOnce()

    await replaceAccountWith('user-2')
    await act(async () => { finishLog(bulkSuccess(['h-1'])) })

    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('keeps the delete confirmation when the same account recovers from a rejected refresh', async () => {
    const { result } = renderBulkActions(new Set(['h-1', 'h-2']))
    act(() => result.current.setShowBulkDeleteConfirm(true))

    await recoverSameAccount('user-1')

    expect(result.current.showBulkDeleteConfirm).toBe(true)
  })

  it('skips the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(result.current).not.toHaveProperty('showBulkSkipConfirm')

    await act(async () => {
      await result.current.confirmBulkSkip()
    })

    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'skip' },
      { habitId: 'h-2', mode: 'skip' },
    ], VIEWED_DATE)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('logs the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(result.current).not.toHaveProperty('showBulkLogConfirm')

    await act(async () => {
      await result.current.confirmBulkLog()
    })

    expect(bulkLog.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'log' },
      { habitId: 'h-2', mode: 'log' },
    ], VIEWED_DATE)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog', 'log'],
    ['skip', bulkSkip, 'confirmBulkSkip', 'skip'],
  ] as const)('keeps a delayed bulk %s result on its mutation date', async (
    _name,
    mutation,
    action,
    mode,
  ) => {
    let resolveRequest!: (value: ReturnType<typeof bulkSuccess>) => void
    mutation.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    const settleBulkHabitResolutions = vi.fn()
    const habitListRef = {
      current: { settleBulkHabitResolutions },
    } as unknown as React.RefObject<HabitListHandle | null>
    let viewedDate = VIEWED_DATE
    const { result, rerender } = renderHook(() => useBulkActions({
      selectedHabitIds: new Set(['h-1']),
      selectedDateStr: viewedDate,
      completionReadOnly: false,
      habitsById: new Map(),
      habitListRef,
      onSuccess: vi.fn(),
      onPartialFailure: vi.fn(),
    }))

    let request!: Promise<void>
    act(() => { request = result.current[action]() })
    viewedDate = '2026-04-02'
    rerender()
    await act(async () => {
      resolveRequest(bulkSuccess(['h-1']))
      await request
    })

    expect(mutation.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1', date: VIEWED_DATE }])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith(
      [{ habitId: 'h-1', mode }],
      VIEWED_DATE,
    )
  })

  it('keeps the confirmation for the irreversible bulk delete', async () => {
    const { result } = renderBulkActions(new Set(['h-1']))

    expect(result.current.showBulkDeleteConfirm).toBe(false)

    act(() => {
      result.current.setShowBulkDeleteConfirm(true)
    })
    expect(result.current.showBulkDeleteConfirm).toBe(true)
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.confirmBulkDelete()
    })
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(result.current.showBulkDeleteConfirm).toBe(false)
  })

  it('retries only failed rows and keeps them selected', async () => {
    bulkLog.mutateAsync
      .mockResolvedValueOnce({
        results: [
          { habitId: 'h-1', status: 'Success' },
          { habitId: 'h-2', status: 'Failed' },
        ],
      })
      .mockResolvedValueOnce(bulkSuccess(['h-2']))
    const { result, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))

    await act(async () => {
      await result.current.confirmBulkLog()
    })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-2'])
    const retry = showQueued.mock.calls[0]?.[2] as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    await act(async () => {
      retry?.()
      await Promise.resolve()
    })
    expect(bulkLog.mutateAsync).toHaveBeenLastCalledWith([
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
  })

  it.each(['log', 'skip'] as const)('refuses a queued %s retry after rollover', async (action) => {
    const mutation = action === 'log' ? bulkLog.mutateAsync : bulkSkip.mutateAsync
    mutation.mockResolvedValueOnce({ results: [{ habitId: 'h-1', status: 'Failed' }] })
    const { result, setCompletionReadOnly } = renderBulkActions(new Set(['h-1']))
    await act(async () => {
      if (action === 'log') await result.current.confirmBulkLog()
      else await result.current.confirmBulkSkip()
    })
    const retry = showQueued.mock.calls[0]?.[2] as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    setCompletionReadOnly(true)
    await act(async () => {
      retry?.()
      await Promise.resolve()
    })
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it.each(['log', 'skip'] as const)('refuses a queued %s retry before passive effects after rollover', async (action) => {
    const mutation = action === 'log' ? bulkLog.mutateAsync : bulkSkip.mutateAsync
    mutation.mockResolvedValueOnce({ results: [{ habitId: 'h-1', status: 'Failed' }] })
    const retry = { current: undefined as (() => void) | undefined }
    const { result, setCompletionReadOnly } = renderBulkActions(
      new Set(['h-1']), false, new Map(), () => retry.current?.(),
    )
    await act(async () => {
      if (action === 'log') await result.current.confirmBulkLog()
      else await result.current.confirmBulkSkip()
    })
    retry.current = showQueued.mock.calls[0]?.[2] as (() => void) | undefined
    expect(retry.current).toBeTypeOf('function')
    setCompletionReadOnly(true)
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it('deletes only selected roots so one request covers each server-side subtree', async () => {
    const habitsById = new Map<string, NormalizedHabit>([
      ['parent', { id: 'parent', parentId: null } as NormalizedHabit],
      ['child', { id: 'child', parentId: 'parent' } as NormalizedHabit],
    ])
    const { result } = renderBulkActions(new Set(['parent', 'child']), false, habitsById)

    await act(async () => {
      await result.current.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent'])
  })

  it('refuses completion but allows deletion on an old date', async () => {
    const { result, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1']),
      true,
    )

    await act(async () => {
      await result.current.confirmBulkLog()
      await result.current.confirmBulkSkip()
      await result.current.confirmBulkDelete()
    })

    expect(bulkLog.mutateAsync).not.toHaveBeenCalled()
    expect(bulkSkip.mutateAsync).not.toHaveBeenCalled()
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})
