import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayDate, type TodayDate } from '@/app/(tabs)/use-today-date'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), navigate: vi.fn() }),
  useLocalSearchParams: () => ({}),
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
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
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
