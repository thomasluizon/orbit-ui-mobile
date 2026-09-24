import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackHandler } from '../../test-mocks/react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitDetail, HabitDetailChild, NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'
import { useDrillNavigation, type DrillNavigationState } from '@/hooks/use-drill-navigation'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

function makeChild(overrides: Partial<HabitDetailChild> = {}): HabitDetailChild {
  return {
    id: 'child',
    title: 'Child',
    description: null,
    emoji: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-07-13',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    isOverdue: false,
    position: 0,
    checklistItems: [],
    children: [],
    ...overrides,
  }
}

function makeDetail(overrides: Partial<HabitDetail> = {}): HabitDetail {
  return {
    id: 'p1',
    title: 'Parent',
    description: null,
    emoji: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-07-13',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2026-01-01T00:00:00Z',
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    children: [],
    ...overrides,
  }
}

interface DrillHarness {
  holder: { current: DrillNavigationState }
  rerender: (habitsById: Map<string, NormalizedHabit>, lastUpdated: number, visibilityOptions?: HabitVisibilityOptions) => void
}

function renderDrill(
  habitsById: Map<string, NormalizedHabit> = new Map(),
  lastUpdated = 1,
  visibilityOptions?: HabitVisibilityOptions,
): DrillHarness {
  const holder = { current: null as unknown as DrillNavigationState }
  function Harness({
    habitsById: byId,
    lastUpdated: updated,
    visibilityOptions: options,
  }: Readonly<{ habitsById: Map<string, NormalizedHabit>; lastUpdated: number; visibilityOptions?: HabitVisibilityOptions }>) {
    holder.current = useDrillNavigation(byId, updated, options, 'today')
    return null
  }
  let root: { update: (element: React.ReactElement) => void } | null = null
  TestRenderer.act(() => {
    root = TestRenderer.create(
      <Harness habitsById={habitsById} lastUpdated={lastUpdated} visibilityOptions={visibilityOptions} />,
    )
  })
  return {
    holder,
    rerender: (byId, updated, options = visibilityOptions) => {
      TestRenderer.act(() => {
        root?.update(<Harness habitsById={byId} lastUpdated={updated} visibilityOptions={options} />)
      })
    },
  }
}

async function actAsync(callback: () => Promise<void>): Promise<void> {
  await TestRenderer.act(async () => {
    await callback()
  })
}

describe('mobile useDrillNavigation', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
  })

  it('hides completed drill children until Show completed is enabled', async () => {
    const date = '2026-07-13'
    const children = [
      makeChild({ id: 'one-time', isCompleted: true }),
      makeChild({ id: 'recurring', frequencyUnit: 'Day' }),
    ]
    const habitsById = new Map<string, NormalizedHabit>(children.map((child) => [
      child.id,
      createMockHabit({
        id: child.id, parentId: 'p1', frequencyUnit: child.frequencyUnit,
        isCompleted: child.isCompleted, isLoggedInRange: child.id === 'one-time',
        scheduledDates: [date],
        instances: child.id === 'recurring'
          ? [{ date, status: 'Completed', logId: 'log-1' }]
          : [],
      }),
    ]))
    const options = {
      habitsById, childrenByParent: new Map([['p1', children.map((child) => child.id)]]),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }
    mocks.apiClient.mockResolvedValue(makeDetail({ children }))

    const hidden = renderDrill(habitsById, 1, options)
    await actAsync(() => hidden.holder.current.drillInto('p1'))
    expect(hidden.holder.current.drillChildren).toEqual([])
    expect(hidden.holder.current.hasUnfilteredChildren).toBe(true)
    expect(hidden.holder.current.canRevealCompletedChildren).toBe(true)

    const shown = renderDrill(habitsById, 1, { ...options, showCompleted: true })
    await actAsync(() => shown.holder.current.drillInto('p1'))
    expect(shown.holder.current.drillChildren.map((child) => child.id)).toEqual([
      'one-time', 'recurring',
    ])
    expect(shown.holder.current.completedCount).toBe(2)
  })

  it('counts a visible completed container only with selected-date evidence', async () => {
    const date = '2026-07-13'
    const active = makeChild({ id: 'active', dueDate: date })
    const container = makeChild({
      id: 'container', isCompleted: true, dueDate: '2026-07-12', children: [active],
    })
    const byId = new Map<string, NormalizedHabit>([
      ['container', createMockHabit({
        id: 'container', parentId: 'p1', isCompleted: true,
        dueDate: '2026-07-12', isLoggedInRange: false,
      })],
      ['active', createMockHabit({
        id: 'active', parentId: 'container', dueDate: date, scheduledDates: [date, '2026-07-14'],
      })],
    ])
    const options = {
      habitsById: byId,
      childrenByParent: new Map([['p1', ['container']], ['container', ['active']]]),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }
    mocks.apiClient.mockResolvedValue(makeDetail({ children: [container] }))

    const pastCompletion = renderDrill(byId, 1, options)
    await actAsync(() => pastCompletion.holder.current.drillInto('p1'))
    expect(pastCompletion.holder.current.drillChildren.map((child) => child.id)).toEqual(['container'])
    expect(pastCompletion.holder.current.completedCount).toBe(0)

    const recentCompletionDates = new Map([['container', date]])
    const justCompletedOptions = {
      ...options, recentlyCompletedIds: new Set(['container']),
      recentlyCompletedDates: recentCompletionDates,
    }
    const justCompleted = renderDrill(byId, 1, justCompletedOptions)
    await actAsync(() => justCompleted.holder.current.drillInto('p1'))
    expect(justCompleted.holder.current.completedCount).toBe(1)
    justCompleted.rerender(byId, 1, { ...justCompletedOptions, selectedDate: '2026-07-14' })
    expect(justCompleted.holder.current.drillChildren.map((child) => child.id)).toEqual(['container'])
    expect(justCompleted.holder.current.completedCount).toBe(0)
  })

  it('drills into a habit, fetching and normalizing its children', async () => {
    mocks.apiClient.mockResolvedValue(
      makeDetail({ children: [makeChild({ id: 'c1' }), makeChild({ id: 'c2' })] }),
    )
    const { holder } = renderDrill()

    await actAsync(() => holder.current.drillInto('p1'))

    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/p1')
    expect(holder.current.drillStack).toEqual(['p1'])
    expect(holder.current.currentParentId).toBe('p1')
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['c1', 'c2'])
    expect(holder.current.drillChildren[0]?.parentId).toBe('p1')
    expect(holder.current.currentParent?.id).toBe('p1')
    expect(holder.current.drillLoading).toBe(false)
  })

  it('prefers the store copy of the parent over the freshly fetched one', async () => {
    mocks.apiClient.mockResolvedValue(makeDetail({ children: [makeChild({ id: 'c1' })] }))
    const habitsById = new Map<string, NormalizedHabit>([
      ['p1', createMockHabit({ id: 'p1', title: 'From Store' })],
    ])
    const { holder } = renderDrill(habitsById)

    await actAsync(() => holder.current.drillInto('p1'))

    expect(holder.current.currentParent?.title).toBe('From Store')
  })

  it('does not refetch children that are already cached', async () => {
    mocks.apiClient.mockResolvedValue(makeDetail({ children: [makeChild({ id: 'c1' })] }))
    const { holder } = renderDrill()

    await actAsync(() => holder.current.drillInto('p1'))
    TestRenderer.act(() => holder.current.drillBack())
    await actAsync(() => holder.current.drillInto('p1'))

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(holder.current.drillStack).toEqual(['p1'])
  })

  it('pops the stack on drillBack and clears everything on drillReset', async () => {
    mocks.apiClient.mockResolvedValue(makeDetail({ children: [makeChild({ id: 'c1' })] }))
    const { holder } = renderDrill()

    await actAsync(() => holder.current.drillInto('p1'))
    TestRenderer.act(() => holder.current.drillBack())
    expect(holder.current.drillStack).toEqual([])
    expect(holder.current.currentParentId).toBeNull()

    await actAsync(() => holder.current.drillInto('p1'))
    TestRenderer.act(() => holder.current.drillReset())
    expect(holder.current.drillStack).toEqual([])
    expect(holder.current.currentParent).toBeNull()
    expect(holder.current.drillChildren).toEqual([])
  })

  it('surfaces a friendly error and stops loading when the fetch fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('network'))
    const { holder } = renderDrill()

    await actAsync(() => holder.current.drillInto('p1'))

    expect(holder.current.drillError.length).toBeGreaterThan(0)
    expect(holder.current.drillLoading).toBe(false)
    expect(holder.current.drillChildren).toEqual([])
  })

  it('keeps the active drill error when a stale drill fetch succeeds later', async () => {
    const stale: { resolve: (detail: HabitDetail) => void } = { resolve: () => undefined }
    mocks.apiClient.mockImplementationOnce(() => new Promise<HabitDetail>((resolve) => { stale.resolve = resolve }))
      .mockRejectedValueOnce(new Error('network'))
    const { holder } = renderDrill()

    let staleDrill: Promise<void> = Promise.resolve()
    TestRenderer.act(() => { staleDrill = holder.current.drillInto('p1') })
    TestRenderer.act(() => holder.current.drillBack())
    await actAsync(() => holder.current.drillInto('p2'))
    expect(holder.current.drillError).not.toBe('')

    await actAsync(async () => {
      stale.resolve(makeDetail({ children: [makeChild({ id: 'stale' })] }))
      await staleDrill
    })

    expect(holder.current.currentParentId).toBe('p2')
    expect(holder.current.drillError).not.toBe('')
  })

  it('keeps the latest same-parent failure when an older visit succeeds later', async () => {
    const stale: { resolve: (detail: HabitDetail) => void } = { resolve: () => undefined }
    mocks.apiClient.mockImplementationOnce(() => new Promise<HabitDetail>((resolve) => { stale.resolve = resolve }))
      .mockRejectedValueOnce(new Error('network'))
    const { holder } = renderDrill()

    let staleDrill: Promise<void> = Promise.resolve()
    TestRenderer.act(() => { staleDrill = holder.current.drillInto('p1') })
    TestRenderer.act(() => holder.current.drillBack())
    await actAsync(() => holder.current.drillInto('p1'))
    const latestError = holder.current.drillError
    expect(latestError).not.toBe('')
    expect(holder.current.drillChildren).toEqual([])

    await actAsync(async () => {
      stale.resolve(makeDetail({ children: [makeChild({ id: 'stale' })] }))
      await staleDrill
    })

    expect(holder.current.currentParentId).toBe('p1')
    expect(holder.current.drillError).toBe(latestError)
    expect(holder.current.currentParent).toBeNull()
    expect(holder.current.drillChildren).toEqual([])
    expect(holder.current.drillLoading).toBe(false)
  })

  it('keeps the latest same-parent success when an older visit succeeds later', async () => {
    const stale: { resolve: (detail: HabitDetail) => void } = { resolve: () => undefined }
    mocks.apiClient.mockImplementationOnce(() => new Promise<HabitDetail>((resolve) => { stale.resolve = resolve }))
      .mockResolvedValueOnce(makeDetail({
        title: 'Fresh Parent', children: [makeChild({ id: 'fresh' })],
      }))
    const { holder } = renderDrill()

    let staleDrill: Promise<void> = Promise.resolve()
    TestRenderer.act(() => { staleDrill = holder.current.drillInto('p1') })
    TestRenderer.act(() => holder.current.drillBack())
    await actAsync(() => holder.current.drillInto('p1'))
    expect(holder.current.currentParent?.title).toBe('Fresh Parent')
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['fresh'])

    await actAsync(async () => {
      stale.resolve(makeDetail({ children: [makeChild({ id: 'stale' })] }))
      await staleDrill
    })
    expect(holder.current.currentParent?.title).toBe('Fresh Parent')
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['fresh'])
    expect(holder.current.drillLoading).toBe(false)
  })

  it('finishes loading when an automatic refresh supersedes the initial fetch', async () => {
    const stale: { resolve: (detail: HabitDetail) => void } = { resolve: () => undefined }
    mocks.apiClient.mockImplementationOnce(() => new Promise<HabitDetail>((resolve) => { stale.resolve = resolve }))
      .mockResolvedValueOnce(makeDetail({ children: [makeChild({ id: 'fresh' })] }))
    const habitsById = new Map<string, NormalizedHabit>()
    const { holder, rerender } = renderDrill(habitsById, 1)

    let staleDrill: Promise<void> = Promise.resolve()
    TestRenderer.act(() => { staleDrill = holder.current.drillInto('p1') })
    expect(holder.current.drillLoading).toBe(true)
    await actAsync(async () => {
      rerender(habitsById, 2)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['fresh'])
    expect(holder.current.drillLoading).toBe(false)

    await actAsync(async () => {
      stale.resolve(makeDetail({ children: [makeChild({ id: 'stale' })] }))
      await staleDrill
    })
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['fresh'])
    expect(holder.current.drillLoading).toBe(false)
  })

  it('shows an automatic refresh failure while the initial fetch is pending', async () => {
    const stale: { resolve: (detail: HabitDetail) => void } = { resolve: () => undefined }
    mocks.apiClient.mockImplementationOnce(() => new Promise<HabitDetail>((resolve) => { stale.resolve = resolve }))
      .mockRejectedValueOnce(new Error('network'))
    const habitsById = new Map<string, NormalizedHabit>()
    const { holder, rerender } = renderDrill(habitsById, 1)

    let staleDrill: Promise<void> = Promise.resolve()
    TestRenderer.act(() => { staleDrill = holder.current.drillInto('p1') })
    await actAsync(async () => {
      rerender(habitsById, 2)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(holder.current.drillError).not.toBe('')
    expect(holder.current.drillLoading).toBe(false)

    await actAsync(async () => {
      stale.resolve(makeDetail({ children: [makeChild({ id: 'stale' })] }))
      await staleDrill
    })
    expect(holder.current.drillError).not.toBe('')
    expect(holder.current.drillChildren).toEqual([])
  })

  it('clears a failed drill after Retry loads its children', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeDetail({ children: [makeChild({ id: 'recovered' })] }))
    const { holder } = renderDrill()

    await actAsync(() => holder.current.drillInto('p1'))
    expect(holder.current.drillError).not.toBe('')

    await actAsync(() => holder.current.refreshCurrent())

    expect(holder.current.drillError).toBe('')
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['recovered'])
  })

  it('refreshCurrent silently refetches the active parent with fresh children', async () => {
    mocks.apiClient.mockResolvedValueOnce(
      makeDetail({ children: [makeChild({ id: 'c1' })] }),
    )
    const { holder } = renderDrill()
    await actAsync(() => holder.current.drillInto('p1'))

    mocks.apiClient.mockResolvedValueOnce(
      makeDetail({ children: [makeChild({ id: 'c1' }), makeChild({ id: 'c2' })] }),
    )
    await actAsync(() => holder.current.refreshCurrent())

    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(holder.current.drillChildren.map((child) => child.id)).toEqual(['c1', 'c2'])
    expect(holder.current.drillLoading).toBe(false)
  })

  it('refreshCurrent is a no-op when nothing is being drilled', async () => {
    const { holder } = renderDrill()
    await actAsync(() => holder.current.refreshCurrent())
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('getDrillChildren returns cached children for a known parent and empty otherwise', async () => {
    mocks.apiClient.mockResolvedValue(
      makeDetail({ children: [makeChild({ id: 'c1' })] }),
    )
    const { holder } = renderDrill()
    await actAsync(() => holder.current.drillInto('p1'))

    expect(holder.current.getDrillChildren('p1').map((child) => child.id)).toEqual(['c1'])
    expect(holder.current.getDrillChildren('unknown')).toEqual([])
  })

  it('auto-refreshes the active parent when the store timestamp changes', async () => {
    mocks.apiClient.mockResolvedValue(
      makeDetail({ children: [makeChild({ id: 'c1' })] }),
    )
    const habitsById = new Map<string, NormalizedHabit>()
    const { holder, rerender } = renderDrill(habitsById, 1)
    await actAsync(() => holder.current.drillInto('p1'))
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    await actAsync(async () => {
      rerender(habitsById, 2)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
  })

  it('drills back on a hardware back press while a parent is open', async () => {
    mocks.apiClient.mockResolvedValue(
      makeDetail({ children: [makeChild({ id: 'c1' })] }),
    )
    const { holder } = renderDrill()
    await actAsync(() => holder.current.drillInto('p1'))
    expect(holder.current.currentParentId).toBe('p1')

    TestRenderer.act(() => {
      BackHandler.emitBackPress()
    })

    expect(holder.current.currentParentId).toBeNull()
  })
})
