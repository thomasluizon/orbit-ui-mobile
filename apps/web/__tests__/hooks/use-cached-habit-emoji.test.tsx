import { describe, expect, it } from 'vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { habitKeys } from '@orbit/shared/query'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { useCachedHabitEmoji } from '@/hooks/use-cached-habit-emoji'

describe('useCachedHabitEmoji', () => {
  it('reads the emoji of a habit that sits in a cached list', () => {
    const client = new QueryClient()
    client.setQueryData(habitKeys.list({}), [createMockHabitScheduleItem({ id: 'walk', emoji: '🚶' })])
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useCachedHabitEmoji(), { wrapper })
    expect(result.current('walk')).toBe('🚶')
    expect(result.current('missing')).toBeUndefined()
  })

  it('returns no emoji outside a query client', () => {
    const { result } = renderHook(() => useCachedHabitEmoji())
    expect(result.current('walk')).toBeUndefined()
  })
})
