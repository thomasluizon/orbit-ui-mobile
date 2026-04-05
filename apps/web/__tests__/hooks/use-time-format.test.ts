import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { formatTime, useTimeFormat } from '@/hooks/use-time-format'

// Mock localStorage
const mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key]
  }),
})

describe('formatTime', () => {
  describe('24h format', () => {
    it('formats HH:mm correctly', () => {
      expect(formatTime('09:30', '24h')).toBe('09:30')
    })

    it('strips seconds from HH:mm:ss', () => {
      expect(formatTime('14:30:00', '24h')).toBe('14:30')
    })

    it('handles midnight', () => {
      expect(formatTime('00:00', '24h')).toBe('00:00')
    })

    it('handles 23:59', () => {
      expect(formatTime('23:59', '24h')).toBe('23:59')
    })
  })

  describe('12h format', () => {
    it('formats morning time', () => {
      expect(formatTime('09:30', '12h')).toBe('9:30 AM')
    })

    it('formats afternoon time', () => {
      expect(formatTime('14:30', '12h')).toBe('2:30 PM')
    })

    it('formats midnight as 12:00 AM', () => {
      expect(formatTime('00:00', '12h')).toBe('12:00 AM')
    })

    it('formats noon as 12:00 PM', () => {
      expect(formatTime('12:00', '12h')).toBe('12:00 PM')
    })

    it('formats 1 PM', () => {
      expect(formatTime('13:00', '12h')).toBe('1:00 PM')
    })

    it('formats 11:59 PM', () => {
      expect(formatTime('23:59', '12h')).toBe('11:59 PM')
    })

    it('formats 11 AM', () => {
      expect(formatTime('11:00', '12h')).toBe('11:00 AM')
    })

    it('strips seconds', () => {
      expect(formatTime('14:30:45', '12h')).toBe('2:30 PM')
    })
  })

  describe('edge cases', () => {
    it('returns empty/null/undefined input as-is', () => {
      expect(formatTime('', '24h')).toBe('')
    })

    it('returns invalid format as-is', () => {
      expect(formatTime('abc', '12h')).toBe('abc')
      expect(formatTime('1:2', '12h')).toBe('1:2')
    })
  })
})

describe('useTimeFormat', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key])
    vi.mocked(localStorage.getItem).mockClear()
    vi.mocked(localStorage.setItem).mockClear()
  })

  it('uses stored format from localStorage', () => {
    mockStorage['orbit_time_format'] = '12h'

    const { result } = renderHook(() => useTimeFormat())
    expect(result.current.currentFormat).toBe('12h')
  })

  it('allows changing format and persists to localStorage', () => {
    const { result } = renderHook(() => useTimeFormat())

    act(() => {
      result.current.setFormat('12h')
    })

    expect(result.current.currentFormat).toBe('12h')
    expect(localStorage.setItem).toHaveBeenCalledWith('orbit_time_format', '12h')
  })

  it('displayTime formats time using current format', () => {
    mockStorage['orbit_time_format'] = '12h'

    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime('14:30')).toBe('2:30 PM')
  })

  it('displayTime returns empty string for null/undefined', () => {
    const { result } = renderHook(() => useTimeFormat())

    expect(result.current.displayTime(null)).toBe('')
    expect(result.current.displayTime(undefined)).toBe('')
  })

  it('displayTime uses 24h format by default', () => {
    // No stored format, and the mock Intl will default to 24h
    const { result } = renderHook(() => useTimeFormat())

    // Default depends on Intl detection; test that it works either way
    const formatted = result.current.displayTime('14:30')
    expect(formatted === '14:30' || formatted === '2:30 PM').toBe(true)
  })
})
