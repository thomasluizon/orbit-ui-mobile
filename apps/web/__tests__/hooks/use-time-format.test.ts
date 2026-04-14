import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useTimeFormat } from '@/hooks/use-time-format'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

describe('useTimeFormat', () => {
  it('formats time using the active locale', () => {
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime('14:30')).toBe(
      formatLocaleTime('14:30', 'en'),
    )
  })

  it('returns an empty string for missing values', () => {
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime(null)).toBe('')
    expect(result.current.displayTime(undefined)).toBe('')
  })
})
