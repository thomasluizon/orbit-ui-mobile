import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
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

function renderBulkActions(
  selectedHabitIds: Set<string>,
  completionReadOnly = false,
  habitsById = new Map<string, NormalizedHabit>(),
  onReadOnlyCommit?: () => void,
  accountTimeZone?: string,
) {
  let currentCompletionReadOnly = completionReadOnly
  const onSuccess = vi.fn()
  const onPartialFailure = vi.fn()
  const settleBulkHabitResolutions = vi.fn()
  const habitListRef = {
    current: { settleBulkHabitResolutions },
  } as unknown as React.RefObject<HabitListHandle | null>
  const captured: { current: BulkActions | null } = { current: null }
  function Probe() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      completionReadOnly: currentCompletionReadOnly,
      accountTimeZone,
      habitsById,
      habitListRef,
      onSuccess,
      onPartialFailure,
    })
    React.useLayoutEffect(() => {
      if (currentCompletionReadOnly) onReadOnlyCommit?.()
    })
    return null
  }
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(Probe))
  })
  return {
    captured, onSuccess, onPartialFailure, settleBulkHabitResolutions,
    setCompletionReadOnly(value: boolean) {
      currentCompletionReadOnly = value
      TestRenderer.act(() => tree.update(React.createElement(Probe)))
    },
  }
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

  it('sends only selected habits when deleting a parent with an excluded child', async () => {
    const habits = [
      createMockHabit({ id: 'parent', parentId: null }),
      createMockHabit({ id: 'child-a', parentId: 'parent' }),
      createMockHabit({ id: 'child-b', parentId: 'parent' }),
    ]
    const { captured } = renderBulkActions(
      new Set(['parent', 'child-b']),
      false,
      new Map(habits.map((habit) => [habit.id, habit])),
    )

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent', 'child-b'])
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

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('blocks bulk %s after account midnight without a rerender', async (_name, mutation, action) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T09:59:00Z'))
    const { captured } = renderBulkActions(new Set(['h-1']), false, new Map(), undefined, 'Pacific/Honolulu')
    vi.setSystemTime(new Date('2026-04-09T10:01:00Z'))
    try {
      await TestRenderer.act(async () => { await captured.current![action]() })
      expect(mutation.mutateAsync).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    ], VIEWED_DATE)
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
    const captured: { current: BulkActions | null } = { current: null }
    let viewedDate = VIEWED_DATE
    function Probe() {
      captured.current = useBulkActions({
        selectedHabitIds: new Set(['h-1']),
        selectedDateStr: viewedDate,
        completionReadOnly: false,
        habitsById: new Map(),
        habitListRef,
        onSuccess: vi.fn(),
        onPartialFailure: vi.fn(),
      })
      return null
    }
    let renderer!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe)) })

    let request!: Promise<void>
    TestRenderer.act(() => { request = captured.current![action]() })
    viewedDate = '2026-04-02'
    TestRenderer.act(() => { renderer.update(React.createElement(Probe)) })
    await TestRenderer.act(async () => {
      resolveRequest(bulkSuccess(['h-1']))
      await request
    })

    expect(mutation.mutateAsync).toHaveBeenCalledWith([{ habitId: 'h-1', date: VIEWED_DATE }])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith(
      [{ habitId: 'h-1', mode }],
      VIEWED_DATE,
    )
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('preserves the new date selection when delayed bulk %s completes', async (
    mode,
    mutation,
    action,
  ) => {
    let resolveRequest!: (value: ReturnType<typeof bulkSuccess>) => void
    mutation.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    let viewedDate = VIEWED_DATE
    let selection = new Set(['h-1'])
    const onSuccess = vi.fn(() => { selection = new Set() })
    const onPartialFailure = vi.fn((ids: string[]) => { selection = new Set(ids) })
    const settleBulkHabitResolutions = vi.fn()
    const habitListRef = {
      current: { settleBulkHabitResolutions },
    } as unknown as React.RefObject<HabitListHandle | null>
    const captured: { current: BulkActions | null } = { current: null }
    function Probe() {
      captured.current = useBulkActions({
        selectedHabitIds: selection,
        selectedDateStr: viewedDate,
        completionReadOnly: false,
        habitsById: new Map(),
        habitListRef,
        onSuccess,
        onPartialFailure,
      })
      return null
    }
    let renderer!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe)) })

    let request!: Promise<void>
    TestRenderer.act(() => { request = captured.current![action]() })
    viewedDate = '2026-04-02'
    selection = new Set(['h-2'])
    TestRenderer.act(() => { renderer.update(React.createElement(Probe)) })
    await TestRenderer.act(async () => {
      resolveRequest(bulkSuccess(['h-1']))
      await request
    })

    expect(settleBulkHabitResolutions).toHaveBeenCalledWith(
      [{ habitId: 'h-1', mode }], VIEWED_DATE,
    )
    expect(selection).toEqual(new Set(['h-2']))
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('does not select old failed bulk %s rows on the new date', async (
    _name,
    mutation,
    action,
  ) => {
    let resolveRequest!: (value: { results: { habitId: string; status: string }[] }) => void
    mutation.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    let viewedDate = VIEWED_DATE
    let selection = new Set(['h-1'])
    const onSuccess = vi.fn(() => { selection = new Set() })
    const onPartialFailure = vi.fn((ids: string[]) => { selection = new Set(ids) })
    const habitListRef = {
      current: { settleBulkHabitResolutions: vi.fn() },
    } as unknown as React.RefObject<HabitListHandle | null>
    const captured: { current: BulkActions | null } = { current: null }
    function Probe() {
      captured.current = useBulkActions({
        selectedHabitIds: selection,
        selectedDateStr: viewedDate,
        completionReadOnly: false,
        habitsById: new Map(),
        habitListRef,
        onSuccess,
        onPartialFailure,
      })
      return null
    }
    let renderer!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe)) })

    let request!: Promise<void>
    TestRenderer.act(() => { request = captured.current![action]() })
    viewedDate = '2026-04-02'
    selection = new Set(['h-2'])
    TestRenderer.act(() => { renderer.update(React.createElement(Probe)) })
    await TestRenderer.act(async () => {
      resolveRequest({ results: [{ habitId: 'h-1', status: 'Failed' }] })
      await request
    })

    expect(selection).toEqual(new Set(['h-2']))
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
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

    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
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

  it('retries only failed rows and keeps them selected', async () => {
    bulkSkip.mutateAsync
      .mockResolvedValueOnce({
        results: [
          { habitId: 'h-1', status: 'Success' },
          { habitId: 'h-2', status: 'Failed' },
        ],
      })
      .mockResolvedValueOnce(bulkSuccess(['h-2']))
    const { captured, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkSkip()
    })

    expect(onPartialFailure).toHaveBeenCalledWith(['h-2'])
    const retry = showToast.mock.calls[0]?.[0]?.onAction as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    await TestRenderer.act(async () => {
      retry?.()
      await Promise.resolve()
    })
    expect(bulkSkip.mutateAsync).toHaveBeenLastCalledWith([
      { habitId: 'h-2', date: VIEWED_DATE },
    ])
  })

  it.each(['log', 'skip'] as const)('refuses a queued %s retry after rollover', async (action) => {
    const mutation = action === 'log' ? bulkLog.mutateAsync : bulkSkip.mutateAsync
    mutation.mockResolvedValueOnce({ results: [{ habitId: 'h-1', status: 'Failed' }] })
    const { captured, setCompletionReadOnly } = renderBulkActions(new Set(['h-1']))
    await TestRenderer.act(async () => {
      if (action === 'log') await captured.current!.confirmBulkLog()
      else await captured.current!.confirmBulkSkip()
    })
    const retry = showToast.mock.calls[0]?.[0]?.onAction as (() => void) | undefined
    expect(retry).toBeTypeOf('function')
    setCompletionReadOnly(true)
    await TestRenderer.act(async () => {
      retry?.()
      await Promise.resolve()
    })
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it.each(['log', 'skip'] as const)('refuses a queued %s retry before passive effects after rollover', async (action) => {
    const mutation = action === 'log' ? bulkLog.mutateAsync : bulkSkip.mutateAsync
    mutation.mockResolvedValueOnce({ results: [{ habitId: 'h-1', status: 'Failed' }] })
    const retry = { current: undefined as (() => void) | undefined }
    const { captured, setCompletionReadOnly } = renderBulkActions(
      new Set(['h-1']), false, new Map(), () => retry.current?.(),
    )
    await TestRenderer.act(async () => {
      if (action === 'log') await captured.current!.confirmBulkLog()
      else await captured.current!.confirmBulkSkip()
    })
    retry.current = showToast.mock.calls[0]?.[0]?.onAction as (() => void) | undefined
    expect(retry.current).toBeTypeOf('function')
    setCompletionReadOnly(true)
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it('sends every selected habit to bulk delete', async () => {
    const habitsById = new Map<string, NormalizedHabit>([
      ['parent', { id: 'parent', parentId: null } as NormalizedHabit],
      ['child', { id: 'child', parentId: 'parent' } as NormalizedHabit],
    ])
    const { captured } = renderBulkActions(
      new Set(['parent', 'child']),
      false,
      habitsById,
    )

    await TestRenderer.act(async () => {
      await captured.current!.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent', 'child'])
  })

  it('refuses completion but allows deletion on an old date', async () => {
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
    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['h-1'])
    expect(settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})
