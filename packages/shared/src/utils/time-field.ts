import type { Time24 } from '../contracts/forms'

const TWO_DIGITS_PATTERN = /^\d{2}$/
const THREE_OR_FOUR_DIGITS_PATTERN = /^\d{3,4}$/
const TIME_24_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TIME_12_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap]m)$/i

export function presentTimeFieldValue(value: Time24 | '', hourCycle: 'h23' | 'h12'): string {
  if (!value || hourCycle === 'h23') return value
  const [hourText, minute] = value.split(':')
  const hour = Number(hourText)
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`
}

export function parseTypedTimeFieldValue(value: string, hourCycle: 'h23' | 'h12'): Time24 | null {
  if (hourCycle === 'h23') return TIME_24_PATTERN.test(value) ? value as Time24 : null
  const match = TIME_12_PATTERN.exec(value.trim())
  if (!match) return null
  const hour12 = Number(match[1])
  const hour24 = (hour12 % 12) + (match[3]!.toLowerCase() === 'pm' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${match[2]}` as Time24
}

export function formatTimeFieldInput(value: string, previousValue: string): string {
  if (previousValue.endsWith(':') && value === previousValue.slice(0, -1)) {
    return value.slice(0, -1)
  }
  if (TWO_DIGITS_PATTERN.test(value)) return `${value}:`
  if (THREE_OR_FOUR_DIGITS_PATTERN.test(value)) {
    return `${value.slice(0, 2)}:${value.slice(2)}`
  }
  if (/^\d{2}::$/.test(value)) return value.slice(0, -1)
  return value
}
