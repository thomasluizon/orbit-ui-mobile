import { describe, expect, it } from 'vitest'
import {
  TIME_FORMAT_STORAGE_KEY,
  detectDefaultTimeFormat,
  formatTime,
  isTimeFormat,
} from '../utils/time-format'

describe('time-format utils', () => {
  it('exposes the storage key', () => {
    expect(TIME_FORMAT_STORAGE_KEY).toBe('orbit_time_format')
  })

  it('formats 24h time', () => {
    expect(formatTime('14:30:00', '24h')).toBe('14:30')
  })

  it('formats 12h time', () => {
    expect(formatTime('14:30', '12h')).toBe('2:30 PM')
  })

  it('passes through invalid values', () => {
    expect(formatTime('abc', '12h')).toBe('abc')
  })

  it('recognizes valid time-format values', () => {
    expect(isTimeFormat('12h')).toBe(true)
    expect(isTimeFormat('24h')).toBe(true)
    expect(isTimeFormat('other')).toBe(false)
  })

  it('detects a default format', () => {
    expect(['12h', '24h']).toContain(detectDefaultTimeFormat())
  })
})
