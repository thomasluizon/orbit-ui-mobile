import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
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
const bulkMove = { mutateAsync: vi.fn() }
const showToast = vi.fn()
const showQueued = vi.fn()
const VIEWED_DATE = '2026-04-01'

vi.mock('@/hooks/use-habits', () => ({
  useBulkDeleteHabits: () => bulkDelete,
  useBulkLogHabits: () => bulkLog,
  useBulkSkipHabits: () => bulkSkip,
  useBulkMoveHabitParent: () => bulkMove,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast, showQueued }),
}))

const translationLocale = vi.hoisted(() => ({ current: 'en' }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({
    locale: translationLocale.current, messages: translationLocale.current === 'en' ? en : ptBR,
  }) }
})

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

  const { result, rerender } = renderHook(() => {
    const actions = useBulkActions({
      selectedHabitIds,
      selectedDateStr: VIEWED_DATE,
      completionReadOnly: currentCompletionReadOnly,
      accountTimeZone,
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
  it.each([false, true])('excludes General habits from bulk Skip, mixed=%s', async (mixed) => {
    const general = createMockHabit({ id: 'general', isGeneral: true, frequencyUnit: null })
    const daily = createMockHabit({ id: 'daily' })
    const habits = mixed ? [general, daily] : [general]
    const { result } = renderBulkActions(new Set(habits.map(habit => habit.id)), false,
      new Map(habits.map(habit => [habit.id, habit])))
    await act(async () => { await result.current.confirmBulkSkip() })
    if (mixed) expect(bulkSkip.mutateAsync).toHaveBeenCalledWith([{ habitId: 'daily', date: VIEWED_DATE }])
    else expect(bulkSkip.mutateAsync).not.toHaveBeenCalled()
    expect(result.current.skippableCount).toBe(mixed ? 1 : 0)
  })

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
    translationLocale.current = 'en'
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([
    { locale: 'en', reason: 'This habit is not due yet on that date.', message: '2 selected rows could not be updated.' },
    { locale: 'pt-BR', reason: 'Este hábito ainda não está disponível nessa data.', message: 'Não foi possível atualizar 2 linhas selecionadas.' },
  ])('retries only transient rows from a mixed skip and explains the permanent reason in $locale', async ({ locale, reason, message }) => {
    translationLocale.current = locale
    bulkSkip.mutateAsync.mockResolvedValueOnce({ results: [
      { index: 0, status: 'Failed', habitId: 'permanent', error: 'Not due', errorCode: 'HABIT_NOT_YET_DUE' },
      { index: 1, status: 'Failed', habitId: 'retry-a', error: 'Conflict', errorCode: 'CONCURRENT_UPDATE_CONFLICT' },
      { index: 2, status: 'Failed', habitId: 'retry-b', error: 'Server failed', errorCode: 'MUTATION_FAILED' },
      { index: 3, status: 'Success', habitId: 'done', error: null, errorCode: null },
    ] }).mockResolvedValueOnce(bulkSuccess(['retry-a', 'retry-b']))
    const { result, onPartialFailure, onSuccess, settleBulkHabitResolutions } = renderBulkActions(new Set(['permanent', 'retry-a', 'retry-b', 'done']))
    await act(async () => { await result.current.confirmBulkSkip() })
    expect(onPartialFailure).toHaveBeenCalledWith(['retry-a', 'retry-b'])
    expect(settleBulkHabitResolutions).toHaveBeenCalledWith([{ habitId: 'done', mode: 'skip' }], VIEWED_DATE)
    expect(showQueued.mock.calls[0]?.[0]).toBe(`${reason}\n${message}`)
    const retry = showQueued.mock.calls[0]?.[2] as (() => void)
    await act(async () => { retry(); await Promise.resolve() })
    expect(bulkSkip.mutateAsync).toHaveBeenLastCalledWith([
      { habitId: 'retry-a', date: VIEWED_DATE }, { habitId: 'retry-b', date: VIEWED_DATE },
    ])
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it.each([
    { locale: 'en', reason: 'This habit is already done for that date.' },
    { locale: 'pt-BR', reason: 'Este hábito já foi feito nessa data.' },
  ])('clears a permanently rejected skip and explains it without Retry in $locale', async ({ locale, reason }) => {
    translationLocale.current = locale
    bulkSkip.mutateAsync.mockResolvedValueOnce({ results: [
      { index: 0, status: 'Failed', habitId: 'h-1', error: 'Already completed', errorCode: 'HABIT_ALREADY_COMPLETED' },
    ] })
    const { result, onSuccess, onPartialFailure } = renderBulkActions(new Set(['h-1']))
    await act(async () => { await result.current.confirmBulkSkip() })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(reason)
    expect(showQueued).not.toHaveBeenCalled()
    translationLocale.current = 'en'
  })

  it.each([
    { locale: 'en', message: '1 selected row could not be updated.' },
    { locale: 'pt-BR', message: 'Não foi possível atualizar 1 linha selecionada.' },
  ])('keeps only transient skip failures selected with a singular Retry message in $locale', async ({ locale, message }) => {
    translationLocale.current = locale
    bulkSkip.mutateAsync.mockResolvedValueOnce({ results: [
      { index: 0, status: 'Success', habitId: 'h-1', error: null, errorCode: null },
      { index: 1, status: 'Failed', habitId: 'h-2', error: 'Mutation failed', errorCode: 'MUTATION_FAILED' },
    ] }).mockResolvedValueOnce(bulkSuccess(['h-2']))
    const { result, onSuccess, onPartialFailure } = renderBulkActions(new Set(['h-1', 'h-2']))
    await act(async () => { await result.current.confirmBulkSkip() })
    expect(onPartialFailure).toHaveBeenCalledWith(['h-2'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(showQueued.mock.calls[0]?.[0]).toBe(message)
    const retry = showQueued.mock.calls[0]?.[2] as (() => void)
    expect(retry).toBeTypeOf('function')
    await act(async () => { retry(); await Promise.resolve() })
    expect(bulkSkip.mutateAsync).toHaveBeenLastCalledWith([{ habitId: 'h-2', date: VIEWED_DATE }])
    translationLocale.current = 'en'
  })

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('blocks bulk %s after account midnight without a rerender', async (_name, mutation, action) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T09:59:00Z'))
    const { result } = renderBulkActions(new Set(['h-1']), false, new Map(), undefined, 'Pacific/Honolulu')
    vi.setSystemTime(new Date('2026-04-09T10:01:00Z'))
    await act(async () => { await result.current[action]() })
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
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

  it('does not offer a retry when a bulk write is refused after an account switch', async () => {
    bulkLog.mutateAsync.mockRejectedValue({ code: 'ACCOUNT_CHANGED', status: 409 })
    const { result, onPartialFailure } = renderBulkActions(new Set(['h-1']))

    await act(async () => {
      await result.current.confirmBulkLog().catch(() => {})
    })

    expect(showQueued).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
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

  it.each([
    ['log', bulkLog, 'confirmBulkLog'],
    ['skip', bulkSkip, 'confirmBulkSkip'],
  ] as const)('preserves the new date selection when delayed bulk %s completes', async (
    _name,
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
    const { result, rerender } = renderHook(() => useBulkActions({
      selectedHabitIds: selection,
      selectedDateStr: viewedDate,
      completionReadOnly: false,
      habitsById: new Map(),
      habitListRef,
      onSuccess,
      onPartialFailure,
    }))

    let request!: Promise<void>
    act(() => { request = result.current[action]() })
    viewedDate = '2026-04-02'
    selection = new Set(['h-2'])
    rerender()
    await act(async () => {
      resolveRequest(bulkSuccess(['h-1']))
      await request
    })

    expect(settleBulkHabitResolutions).toHaveBeenCalledWith(
      [{ habitId: 'h-1', mode: _name }], VIEWED_DATE,
    )
    expect(selection).toEqual(new Set(['h-2']))
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(showQueued).not.toHaveBeenCalled()
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
    const { result, rerender } = renderHook(() => useBulkActions({
      selectedHabitIds: selection,
      selectedDateStr: viewedDate,
      completionReadOnly: false,
      habitsById: new Map(),
      habitListRef: { current: { settleBulkHabitResolutions: vi.fn() } } as unknown as React.RefObject<HabitListHandle | null>,
      onSuccess,
      onPartialFailure,
    }))

    let request!: Promise<void>
    act(() => { request = result.current[action]() })
    viewedDate = '2026-04-02'
    selection = new Set(['h-2'])
    rerender()
    await act(async () => {
      resolveRequest({ results: [{ habitId: 'h-1', status: 'Failed' }] })
      await request
    })

    expect(selection).toEqual(new Set(['h-2']))
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(showQueued).not.toHaveBeenCalled()
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

  it('sends only selected habits when a child is excluded', async () => {
    const habitsById = new Map<string, NormalizedHabit>([
      ['parent', { id: 'parent', parentId: null } as NormalizedHabit],
      ['child-a', { id: 'child-a', parentId: 'parent' } as NormalizedHabit],
      ['child-b', { id: 'child-b', parentId: 'parent' } as NormalizedHabit],
    ])
    const { result } = renderBulkActions(new Set(['parent', 'child-b']), false, habitsById)

    await act(async () => {
      await result.current.confirmBulkDelete()
    })

    expect(bulkDelete.mutateAsync).toHaveBeenCalledWith(['parent', 'child-b'])
  })

  it('does not send an empty delete request', async () => {
    const { result } = renderBulkActions(new Set())

    await act(async () => { await result.current.confirmBulkDelete() })

    expect(bulkDelete.mutateAsync).not.toHaveBeenCalled()
  })

  it('sends only selected habits to log and skip', async () => {
    const { result } = renderBulkActions(new Set(['parent', 'child-b']))

    await act(async () => {
      await result.current.confirmBulkLog()
      await result.current.confirmBulkSkip()
    })

    const selected = [
      { habitId: 'parent', date: VIEWED_DATE },
      { habitId: 'child-b', date: VIEWED_DATE },
    ]
    expect(bulkLog.mutateAsync).toHaveBeenCalledWith(selected)
    expect(bulkSkip.mutateAsync).toHaveBeenCalledWith(selected)
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

describe('bulk move selection settlement', () => {
  it('moves three habits in one mutation without arming another confirmation', async () => {
    bulkMove.mutateAsync.mockResolvedValue(bulkSuccess(['a', 'b', 'c']))
    const { result, onSuccess, onPartialFailure } = renderBulkActions(new Set(['a', 'b', 'c']))
    await act(async () => { await result.current.confirmBulkMove(['a', 'b', 'c'], 'parent') })
    expect(bulkMove.mutateAsync).toHaveBeenCalledExactlyOnceWith({ habitIds: ['a', 'b', 'c'], parentId: 'parent' })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onPartialFailure).not.toHaveBeenCalled()
    expect(result.current.showBulkDeleteConfirm).toBe(false)
  })

  it('retains only failed ids and returns the API reasons for an inline retry', async () => {
    bulkMove.mutateAsync.mockResolvedValue({ results: [
      { habitId: 'a', status: 'Success' }, { habitId: 'b', status: 'Failed', error: 'Target no longer exists' },
    ] })
    const { result, onSuccess, onPartialFailure } = renderBulkActions(new Set(['a', 'b']))
    let response: Awaited<ReturnType<typeof result.current.confirmBulkMove>>
    await act(async () => { response = await result.current.confirmBulkMove(['a', 'b'], null) })
    expect(onPartialFailure).toHaveBeenCalledWith(['b'])
    expect(onSuccess).not.toHaveBeenCalled()
    expect(response!.results[1]?.error).toBe('Target no longer exists')
  })

  it('keeps the selection when the request fails', async () => {
    bulkMove.mutateAsync.mockRejectedValue(new Error('network'))
    const { result, onSuccess, onPartialFailure } = renderBulkActions(new Set(['a']))
    await expect(result.current.confirmBulkMove(['a'], null)).rejects.toThrow('network')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onPartialFailure).not.toHaveBeenCalled()
  })
})
