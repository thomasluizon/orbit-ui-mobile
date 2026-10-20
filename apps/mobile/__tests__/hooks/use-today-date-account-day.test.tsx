import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { useTodayDate, type TodayDate } from '@/app/(tabs)/use-today-date'

const TestRenderer = require('react-test-renderer')

const dateTestState = vi.hoisted(() => ({ locale: 'en', selected: '', navigate: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: dateTestState.locale },
    t: (key: string) => {
      const messages = dateTestState.locale === 'en' ? en : ptBR
      const value = messages.dates[key.slice('dates.'.length) as keyof typeof messages.dates]
      return typeof value === 'string' ? value : key
    },
  }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), navigate: dateTestState.navigate }),
  useLocalSearchParams: () => ({ date: dateTestState.selected || undefined }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'Pacific/Kiritimati' } }),
}))

const originalTimeZone = process.env.TZ

describe('mobile Today account day', () => {
  beforeEach(() => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T09:59:59Z'))
    dateTestState.locale = 'en'
    dateTestState.selected = ''
    dateTestState.navigate.mockClear()
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
    let current: TodayDate | null = null
    function Probe() {
      current = useTodayDate()
      return null
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<Probe />) })
    expect(current!.dayName).toBe(expected)
    expect(current!.numericDate).toBe(locale === 'en' ? `September ${Number(selected.slice(-2))}` : `${Number(selected.slice(-2))} de setembro`)
    TestRenderer.act(() => tree!.unmount())
  })

  it('returns from a pinned day to the explicit tabs index without a date parameter', () => {
    dateTestState.selected = '2026-09-09'
    let current: TodayDate | null = null
    function Probe() {
      current = useTodayDate()
      return null
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<Probe />) })
    TestRenderer.act(() => current!.goToToday())
    expect(dateTestState.navigate).toHaveBeenCalledExactlyOnceWith('/(tabs)')
    expect(dateTestState.navigate).not.toHaveBeenCalledWith('/')
    TestRenderer.act(() => tree!.unmount())
  })

  it('moves Today at account midnight while the device stays on yesterday', () => {
    let current: TodayDate | null = null
    function Probe() {
      current = useTodayDate()
      return null
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<Probe />) })
    expect(current!.dateStr).toBe('2026-09-11')

    TestRenderer.act(() => vi.advanceTimersByTime(2_000))

    expect(current!.today).toBe('2026-09-12')
    expect(current!.dateStr).toBe('2026-09-12')
    TestRenderer.act(() => tree!.unmount())
  })
})
