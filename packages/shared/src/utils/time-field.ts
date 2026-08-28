const TWO_DIGITS_PATTERN = /^\d{2}$/
const THREE_OR_FOUR_DIGITS_PATTERN = /^\d{3,4}$/

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
