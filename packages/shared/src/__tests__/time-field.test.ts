import { describe, expect, it } from 'vitest'
import { formatTimeFieldInput } from '../utils/time-field'

describe('time field input formatting', () => {
  it('inserts the separator for a numeric keypad buffer and accepts pasted forms', () => {
    expect(formatTimeFieldInput('1', '')).toBe('1')
    expect(formatTimeFieldInput('19', '1')).toBe('19:')
    expect(formatTimeFieldInput('193', '19:')).toBe('19:3')
    expect(formatTimeFieldInput('1930', '')).toBe('19:30')
    expect(formatTimeFieldInput('19:30', '')).toBe('19:30')
    expect(formatTimeFieldInput('19::', '19:')).toBe('19:')
  })

  it('removes the preceding digit when backspace removes the separator', () => {
    expect(formatTimeFieldInput('19', '19:')).toBe('1')
  })

  it('leaves invalid drafts visible for validation instead of filtering input', () => {
    expect(formatTimeFieldInput('time', '')).toBe('time')
    expect(formatTimeFieldInput('19300', '')).toBe('19300')
  })
})
