import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackHandler } from '../../test-mocks/react-native'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitDetail, HabitDetailChild, NormalizedHabit } from '@orbit/shared/types/habit'
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
  rerender: (habitsById: Map<string, NormalizedHabit>, lastUpdated: number) => void
}

function renderDrill(
  habitsById: Map<string, NormalizedHabit> = new Map(),
  lastUpdated = 1,
): DrillHarness {
  const holder = { current: null as unknown as DrillNavigationState }
  function Harness({
    habitsById: byId,
    lastUpdated: updated,
  }: Readonly<{ habitsById: Map<string, NormalizedHabit>; lastUpdated: number }>) {
    holder.current = useDrillNavigation(byId, updated)
    return null
  }
  let root: { update: (element: React.ReactElement) => void } | null = null
  TestRenderer.act(() => {
    root = TestRenderer.create(
      <Harness habitsById={habitsById} lastUpdated={lastUpdated} />,
    )
  })
  return {
    holder,
    rerender: (byId, updated) => {
      TestRenderer.act(() => {
        root?.update(<Harness habitsById={byId} lastUpdated={updated} />)
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
