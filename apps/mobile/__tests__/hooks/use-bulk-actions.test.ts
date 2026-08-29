import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { HabitListHandle } from '@/components/habit-list'

const TestRenderer = require('react-test-renderer')

const bulkDelete = { mutateAsync: vi.fn() }
const bulkLog = { mutateAsync: vi.fn() }
const bulkSkip = { mutateAsync: vi.fn() }
const showToast = vi.fn()
const VIEWED_DATE = '2026-04-01'

vi.mock('react-i18next', async () => {
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  const translate = (key: string) => {
    let value: unknown = messages
    for (const segment of key.split('.')) {
      if (typeof value !== 'object' || value === null || !(segment in value)) return key
      value = (value as Record<string, unknown>)[segment]
    }
    return typeof value === 'string' ? value : key
  }

  return { useTranslation: () => ({ t: translate }) }
})

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast }),
}))

type BulkActions = ReturnType<typeof useBulkActions>

function renderBulkActions(selectedHabitIds: Set<string>, readOnly = false) {
  const onSuccess = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      readOnly,
      habitListRef,
      onSuccess,
    })
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return { captured, onSuccess, settleBulkHabitResolutions }
}

function bulkSuccess(ids: string[]) {
  return { results: ids.map((habitId) => ({ habitId, status: 'Success' as const })) }
}

describe('useBulkActions confirmBulkDelete', () => {
  beforeEach(() => {
    showToast.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
  })

  it('deletes the selected habits then closes the confirm and reports success', async () => {
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1', 'h-2'])
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
  })

  it('is a no-op when nothing is selected', async () => {
    const { captured, onSuccess } = renderBulkActions(new Set())

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('keeps the confirmation and selection when an offline delete is refused', async () => {
    bulkDelete.mutateAsync.mockResolvedValueOnce({
      results: [],
      offlineFailureIds: ['h-1'],
    })
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(new Set(['h-1']))

    TestRenderer.act(() => {
      captured.current!.setShowBulkDeleteConfirm(true)
    })
    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(captured.current!.showBulkDeleteConfirm).toBe(true)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'Nothing changed because your device is offline.',
    })
  })

  it('closes after an ambiguous delete and refreshes without offering a retry', async () => {
    bulkDelete.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: ['h-1'],
      offlineFailureIds: [],
    })
    const { captured, onSuccess } = renderBulkActions(new Set(['h-1']))

    TestRenderer.act(() => {
      captured.current!.setShowBulkDeleteConfirm(true)
    })
    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'The connection dropped. The list was refreshed.',
    })
    expect(showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
  })
})

/**
 * Ticket #42 is the product authority: a confirmation belongs to an
 * irreversible act only. Bulk log and bulk skip act at once, and only bulk
 * delete asks. These assertions state that requirement rather than inherit it.
 */
describe('useBulkActions reversibility boundary', () => {
  beforeEach(() => {
    showToast.mockReset()
    bulkDelete.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1']))
    bulkLog.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
    bulkSkip.mutateAsync.mockReset().mockResolvedValue(bulkSuccess(['h-1', 'h-2']))
  })

  it('skips the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(Object.keys(captured.current!)).not.toContain('showBulkSkipConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkSkip()
    })

    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'skip' },
      { habitId: 'h-2', mode: 'skip' },
    ])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('logs the selection on the viewed historical date with no confirmation state to clear', async () => {
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    expect(Object.keys(captured.current!)).not.toContain('showBulkLogConfirm')

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkLog()
    })

    expect(bulkLog.mutateAsync).toHaveBeenCalledWith([
      { habitId: 'h-1', date: VIEWED_DATE },
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([
      { habitId: 'h-1', mode: 'log' },
      { habitId: 'h-2', mode: 'log' },
    ])
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('keeps the selection and reports an offline bulk %s refusal', async (
    _mode,
    mutation,
    action,
  ) => {
    mutation.mutateAsync.mockResolvedValueOnce({
      results: [],
      offlineFailureIds: ['h-1', 'h-2'],
    })
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => {
      await captured.current![action]()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'Nothing changed because your device is offline.',
    })
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('refreshes after an ambiguous bulk %s without settling or offering a retry', async (
    _mode,
    mutation,
    action,
  ) => {
    mutation.mutateAsync.mockResolvedValueOnce({
      results: [],
      ambiguousIds: ['h-1', 'h-2'],
      offlineFailureIds: [],
    })
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1', 'h-2']),
    )

    await TestRenderer.act(async () => {
      await captured.current![action]()
    })

    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([])
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'The connection dropped. The list was refreshed.',
    })
    expect(showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
  })

  it('keeps the confirmation for the irreversible bulk delete', async () => {
    const { captured } = renderBulkActions(new Set(['h-1']))

    expect(captured.current!.showBulkDeleteConfirm).toBe(false)

    TestRenderer.act(() => {
      captured.current!.setShowBulkDeleteConfirm(true)
    })
    expect(captured.current!.showBulkDeleteConfirm).toBe(true)
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(captured.current!.showBulkDeleteConfirm).toBe(false)
  })

  it('refuses log, skip, and delete mutations on a read-only date', async () => {
    const { captured, onSuccess, settleBulkHabitResolutions } = renderBulkActions(
      new Set(['h-1']),
      true,
    )

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkLog()
      await captured.current!.confirmBulkSkip()
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkLog.mutateAsync).not.toHaveBeenCalled()
    expect(bulkSkip.mutateAsync).not.toHaveBeenCalled()
    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
