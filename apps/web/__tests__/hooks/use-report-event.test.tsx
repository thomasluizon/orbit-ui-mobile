import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useReportEvent } from '@/hooks/use-gamification'

const enqueueCelebration = vi.fn()
const reportAchievementEvent = vi.fn()

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (
    selector: (state: { enqueueCelebration: typeof enqueueCelebration }) => unknown,
  ) => selector({ enqueueCelebration }),
}))

vi.mock('@/app/actions/gamification', () => ({
  reportAchievementEvent: (eventKey: string) => reportAchievementEvent(eventKey),
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makeGranted() {
  return {
    id: 'show_off',
    name: 'Show Off',
    description: 'Share your first card',
    category: 'Sharing',
    rarity: 'Uncommon',
    xpReward: 75,
    iconKey: 'show_off',
    isEarned: true,
    earnedAtUtc: null,
  }
}

describe('useReportEvent', () => {
  beforeEach(() => {
    enqueueCelebration.mockReset()
    reportAchievementEvent.mockReset()
  })

  it('celebrates each granted achievement and invalidates gamification on success', async () => {
    reportAchievementEvent.mockResolvedValue({ granted: [makeGranted()] })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useReportEvent(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate('card_shared')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reportAchievementEvent).toHaveBeenCalledWith('card_shared')
    expect(enqueueCelebration).toHaveBeenCalledWith('achievement', {
      achievementId: 'show_off',
      xpReward: 75,
    })
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('does not celebrate when nothing was granted (idempotent)', async () => {
    reportAchievementEvent.mockResolvedValue({ granted: [] })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useReportEvent(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate('wrapped_viewed')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(enqueueCelebration).not.toHaveBeenCalled()
  })
})
