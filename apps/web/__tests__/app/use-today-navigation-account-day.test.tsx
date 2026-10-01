import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { TodayProvider } from '@/app/(app)/today-provider'
import { useTodayNavigation } from '@/app/(app)/use-today-navigation'

const dateTestState = vi.hoisted(() => ({ locale: 'en', selected: '' }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages = dateTestState.locale === 'en' ? en : ptBR
    const value = messages.dates[key.slice('dates.'.length) as keyof typeof messages.dates]
    return typeof value === 'string' ? value : key
  },
  useLocale: () => dateTestState.locale,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(dateTestState.selected ? { date: dateTestState.selected } : {}),
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
    dateTestState.locale = 'en'
    dateTestState.selected = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  it.each([
    ['en', '2026-09-12', 'Today'],
    ['en', '2026-09-11', 'Yesterday'],
    ['en', '2026-09-13', 'Tomorrow'],
    ['en', '2026-09-09', 'Wednesday'],
    ['pt-BR', '2026-09-12', 'Hoje'],
    ['pt-BR', '2026-09-11', 'Ontem'],
    ['pt-BR', '2026-09-13', 'Amanhã'],
    ['pt-BR', '2026-09-09', 'Quarta-feira'],
  ])('names %s %s as %s', (locale, selected, expected) => {
    dateTestState.locale = locale
    dateTestState.selected = selected
    vi.setSystemTime(new Date('2026-09-11T10:00:00Z'))
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TodayProvider>{children}</TodayProvider>
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useTodayNavigation('2026-09-12'), { wrapper })
    expect(result.current.dateNav.dayName).toBe(expected)
    expect(result.current.dateNav.numericDate).toBe(locale === 'en' ? `September ${Number(selected.slice(-2))}` : `${Number(selected.slice(-2))} de setembro`)
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
