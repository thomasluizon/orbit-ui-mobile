import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayProvider } from '@/app/(app)/today-provider'
import { useTodayNavigation } from '@/app/(app)/use-today-navigation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => vi.fn(),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'Pacific/Kiritimati' } }),
}))

const originalTimeZone = process.env.TZ

describe('Today navigation account day', () => {
  beforeEach(() => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T09:59:59Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  it('moves Today at account midnight while the device stays on yesterday', () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TodayProvider>{children}</TodayProvider>
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useTodayNavigation('2026-09-11'), { wrapper })
    expect(result.current.dateStr).toBe('2026-09-11')

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(result.current.today).toBe('2026-09-12')
    expect(result.current.dateStr).toBe('2026-09-12')
    expect(result.current.isTodaySelected).toBe(true)
  })
})
