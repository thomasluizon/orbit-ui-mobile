import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useTimeFormat } from '@/hooks/use-time-format'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

let uses24HourClock: boolean | undefined = true

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: uses24HourClock === undefined ? undefined : { uses24HourClock } }),
}))

describe('useTimeFormat', () => {
  it.each([
    [true, 'h23'],
    [false, 'h12'],
  ] as const)('formats time using the server-resolved clock setting %s', (uses24Hour, hourCycle) => {
    uses24HourClock = uses24Hour
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime('14:30')).toBe(
      formatLocaleTime('14:30', 'en', { hour: 'numeric', minute: '2-digit', hourCycle }),
    )
  })

  it('does not assume a clock setting before the profile resolves', () => {
    uses24HourClock = undefined
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime('14:30')).toBe('')
  })

  it('returns an empty string for missing values', () => {
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime(null)).toBe('')
    expect(result.current.displayTime(undefined)).toBe('')
  })
})
