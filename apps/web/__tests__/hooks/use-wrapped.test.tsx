import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { useWrapped } from '@/hooks/use-wrapped'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  reportEvent: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/hooks/use-gamification', () => ({
  useReportEvent: () => ({ mutate: mocks.reportEvent }),
}))

describe('web useWrapped', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset()
    mocks.reportEvent.mockReset()
  })

  it('keeps an all-zero recap empty', () => {
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({
        goalCompletions: 0,
        metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useWrapped('month'))
    expect(result.current.isEmpty).toBe(true)
  })

  it('keeps Start enabled and reaches the goals slide for a goal-only recap', () => {
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({
        goalCompletions: 4,
        metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useWrapped('month'))
    expect(result.current.isEmpty).toBe(false)
    expect(result.current.slides.at(-1)?.id).toBe('share')
    expect(result.current.slides).toContainEqual({ id: 'goals', closedGoals: 4 })
  })
})
