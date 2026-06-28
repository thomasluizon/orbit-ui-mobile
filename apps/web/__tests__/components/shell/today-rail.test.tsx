import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useHabitsMock, computeDayProgressMock, emptyHabitsById } = vi.hoisted(() => ({
  useHabitsMock: vi.fn(),
  computeDayProgressMock: vi.fn(),
  emptyHabitsById: new Map<string, unknown>(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@orbit/shared/utils', () => ({
  computeDayProgress: computeDayProgressMock,
  formatAPIDate: () => '2026-06-28',
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: useHabitsMock,
  EMPTY_HABITS_BY_ID: emptyHabitsById,
}))

import { TodayRail } from '@/components/shell/today-rail'

describe('TodayRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHabitsMock.mockReturnValue({ data: undefined })
    computeDayProgressMock.mockReturnValue({ done: 0, total: 0 })
  })

  it('renders the progress orbit with the computed done and total', () => {
    useHabitsMock.mockReturnValue({ data: { habitsById: new Map() } })
    computeDayProgressMock.mockReturnValue({ done: 3, total: 7 })

    render(<TodayRail />)

    expect(
      screen.getByRole('img', { name: 'rail.progressLabel({"done":3,"total":7})' }),
    ).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('/7')).toBeInTheDocument()
    expect(screen.getByText('rail.todayProgress')).toBeInTheDocument()
  })

  it('computes progress from the day-query habits and the current date', () => {
    const habitsById = new Map()
    useHabitsMock.mockReturnValue({ data: { habitsById } })

    render(<TodayRail />)

    expect(computeDayProgressMock).toHaveBeenCalledWith(habitsById, '2026-06-28')
  })

  it('falls back to the empty habit map when the query has no data', () => {
    useHabitsMock.mockReturnValue({ data: undefined })

    render(<TodayRail />)

    expect(computeDayProgressMock).toHaveBeenCalledWith(emptyHabitsById, '2026-06-28')
  })

  it('requests the current day habits including overdue', () => {
    render(<TodayRail />)

    expect(useHabitsMock).toHaveBeenCalledWith({
      dateFrom: '2026-06-28',
      dateTo: '2026-06-28',
      includeOverdue: true,
    })
  })
})
