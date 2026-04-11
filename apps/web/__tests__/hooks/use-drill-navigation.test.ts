import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    return t
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useDrillNavigation } from '@/hooks/use-drill-navigation'

function makeHabit(overrides: Partial<NormalizedHabit> = {}): NormalizedHabit {
  return {
    id: 'h1',
    title: 'Test',
    description: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-15',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    parentId: null,
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: true,
    flexibleTarget: null,
    flexibleCompleted: 0,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
    searchMatches: null,
    ...overrides,
  } as NormalizedHabit
}

function makeDetailResponse() {
  return {
    id: 'parent1',
    title: 'Parent',
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
        id: 'child1',
        title: 'Child 1',
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

describe('useDrillNavigation', () => {
  const habitsById = new Map<string, NormalizedHabit>([
    ['parent1', makeHabit({ id: 'parent1', title: 'Parent' })],
  ])

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('starts with empty drill stack', () => {
    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))
    expect(result.current.drillStack).toEqual([])
    expect(result.current.currentParentId).toBeNull()
    expect(result.current.currentParent).toBeNull()
    expect(result.current.drillChildren).toEqual([])
  })

  it('drills into a habit and fetches children', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDetailResponse()),
    })

    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))

    await act(async () => {
      await result.current.drillInto('parent1')
    })

    await waitFor(() => {
      expect(result.current.drillStack).toEqual(['parent1'])
      expect(result.current.currentParentId).toBe('parent1')
      expect(result.current.drillChildren.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('drills back removes last item from stack', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDetailResponse()),
    })

    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))

    await act(async () => {
      await result.current.drillInto('parent1')
    })

    act(() => {
      result.current.drillBack()
    })

    expect(result.current.drillStack).toEqual([])
    expect(result.current.currentParentId).toBeNull()
  })

  it('drillReset clears everything', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDetailResponse()),
    })

    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))

    await act(async () => {
      await result.current.drillInto('parent1')
    })

    act(() => {
      result.current.drillReset()
    })

    expect(result.current.drillStack).toEqual([])
    expect(result.current.drillChildren).toEqual([])
  })

  it('getDrillChildren returns empty for unknown parent', () => {
    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))
    expect(result.current.getDrillChildren('unknown')).toEqual([])
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useDrillNavigation(habitsById, 0))

    await act(async () => {
      await result.current.drillInto('parent1')
    })

    expect(result.current.drillError).toBeTruthy()
  })
})
