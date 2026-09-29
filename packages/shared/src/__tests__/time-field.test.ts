import { describe, expect, it } from 'vitest'
import { formatTimeFieldInput, presentTimeFieldValue, parseTypedTimeFieldValue } from '../utils/time-field'

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

  it('presents and parses both clock cycles while keeping a 24-hour wire value', () => {
    expect(presentTimeFieldValue('19:30', 'h23')).toBe('19:30')
    expect(presentTimeFieldValue('19:30', 'h12')).toBe('7:30 pm')
    expect(presentTimeFieldValue('00:05', 'h12')).toBe('12:05 am')
    expect(presentTimeFieldValue('', 'h12')).toBe('')
    expect(parseTypedTimeFieldValue('7:30 pm', 'h12')).toBe('19:30')
    expect(parseTypedTimeFieldValue('12:05 am', 'h12')).toBe('00:05')
    expect(parseTypedTimeFieldValue('19:30', 'h23')).toBe('19:30')
    expect(parseTypedTimeFieldValue('19:30', 'h12')).toBeNull()
    expect(parseTypedTimeFieldValue('25:00', 'h23')).toBeNull()
  })
})
