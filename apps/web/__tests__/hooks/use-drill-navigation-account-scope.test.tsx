import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const ACCOUNT_A_PARENT_TITLE = 'Account A morning routine'

function accountAHabitDetail() {
  return {
    id: 'parent-a',
    title: ACCOUNT_A_PARENT_TITLE,
    description: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-15',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    children: [
      {
        id: 'child-a',
        title: 'Account A stretch',
        description: '',
        frequencyUnit: null,
        frequencyQuantity: null,
        isBadHabit: false,
        isCompleted: false,
        isGeneral: false,
        isFlexible: false,
        days: [],
        dueDate: '2025-01-15',
        dueTime: null,
        dueEndTime: null,
        endDate: null,
        position: 0,
        checklistItems: [],
        children: [],
      },
    ],
  }
}

/** The cache is cleared on a replacement, so the next account's map holds nothing of account A. */
const EMPTY_HABITS_BY_ID = new Map<string, NormalizedHabit>()

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(accountAHabitDetail()),
  } as unknown as Response)
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function drillIntoAccountAParent() {
  const rendered = renderHook(() => useDrillNavigation(EMPTY_HABITS_BY_ID, 0))
  await act(async () => {
    await rendered.result.current.drillInto('parent-a')
  })
  await waitFor(() => {
    expect(rendered.result.current.currentParent?.title).toBe(ACCOUNT_A_PARENT_TITLE)
  })
  return rendered
}

it('drops the drilled habit and its children when another account replaces the tab', async () => {
  const { result } = await drillIntoAccountAParent()

  await replaceAccountWith('user-2')

  expect(result.current.drillStack).toEqual([])
  expect(result.current.currentParent).toBeNull()
  expect(result.current.drillChildren).toEqual([])
  expect(result.current.getDrillChildren('parent-a')).toEqual([])
})

it('keeps the drilled habit when the same account recovers from a rejected refresh', async () => {
  const { result } = await drillIntoAccountAParent()

  await recoverSameAccount('user-1')

  expect(result.current.drillStack).toEqual(['parent-a'])
  expect(result.current.currentParent?.title).toBe(ACCOUNT_A_PARENT_TITLE)
})

it('ignores old habit detail received after the account changes', async () => {
  let releaseDetail!: (response: Response) => void
  vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((resolve) => {
    releaseDetail = resolve
  }))
  const { result } = renderHook(() => useDrillNavigation(EMPTY_HABITS_BY_ID, 0))
  act(() => { void result.current.drillInto('parent-a') })

  await replaceAccountWith('user-2')
  await act(async () => {
    releaseDetail(Response.json(accountAHabitDetail()))
    await Promise.resolve()
  })

  expect(result.current.getDrillChildren('parent-a')).toEqual([])
  expect(result.current.currentParent).toBeNull()
})
