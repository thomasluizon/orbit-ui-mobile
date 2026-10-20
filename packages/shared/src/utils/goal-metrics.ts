import { getDateTimeFormat, getNumberFormat } from './intl-format-cache'

const GOAL_HISTORY_MAXIMUM_SIGNIFICANT_DIGITS = 20

interface DecimalDigits {
  digits: string
  scale: number
  negative: boolean
}

function normalizeDigits(digits: string): string {
  return digits.replace(/^0+(?=\d)/, '')
}

function getDecimalDigits(value: number): DecimalDigits {
  const valueText = value.toString().toLowerCase()
  const negative = valueText.startsWith('-')
  const unsignedText = negative ? valueText.slice(1) : valueText
  const exponentMarker = unsignedText.indexOf('e')
  const coefficient = exponentMarker === -1 ? unsignedText : unsignedText.slice(0, exponentMarker)
  const exponent = exponentMarker === -1 ? 0 : Number(unsignedText.slice(exponentMarker + 1))
  const decimalPoint = coefficient.indexOf('.')
  const integerLength = decimalPoint === -1 ? coefficient.length : decimalPoint
  const coefficientDigits = coefficient.replace('.', '')
  const decimalPosition = integerLength + exponent
  const leadingFractionZeros = Math.max(-decimalPosition, 0)
  const trailingIntegerZeros = Math.max(decimalPosition - coefficientDigits.length, 0)
  const digits = normalizeDigits(
    `${'0'.repeat(leadingFractionZeros)}${coefficientDigits}${'0'.repeat(trailingIntegerZeros)}`,
  )
  const scale = Math.max(coefficientDigits.length - decimalPosition, 0)

  return { digits, scale, negative: negative && digits !== '0' }
}

function compareDigits(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length
  return left === right ? 0 : left > right ? 1 : -1
}

function addDigits(left: string, right: string): string {
  const length = Math.max(left.length, right.length)
  const paddedLeft = left.padStart(length, '0')
  const paddedRight = right.padStart(length, '0')
  const result: string[] = []
  let carry = 0

  for (let index = length - 1; index >= 0; index -= 1) {
    const sum = Number(paddedLeft[index]) + Number(paddedRight[index]) + carry
    result.push(String(sum % 10))
    carry = Math.floor(sum / 10)
  }
  if (carry > 0) result.push(String(carry))

  return normalizeDigits(result.reverse().join(''))
}

function subtractDigits(left: string, right: string): string {
  const paddedRight = right.padStart(left.length, '0')
  const result: string[] = []
  let borrow = 0

  for (let index = left.length - 1; index >= 0; index -= 1) {
    let difference = Number(left[index]) - Number(paddedRight[index]) - borrow
    borrow = difference < 0 ? 1 : 0
    if (borrow) difference += 10
    result.push(String(difference))
  }

  return normalizeDigits(result.reverse().join(''))
}

function subtractDecimalValues(previousValue: number, value: number): DecimalDigits {
  const valueDigits = getDecimalDigits(value)
  const previousDigits = getDecimalDigits(previousValue)
  const scale = Math.max(valueDigits.scale, previousDigits.scale)
  const left = normalizeDigits(
    valueDigits.digits.padEnd(valueDigits.digits.length + scale - valueDigits.scale, '0'),
  )
  const right = normalizeDigits(
    previousDigits.digits.padEnd(
      previousDigits.digits.length + scale - previousDigits.scale,
      '0',
    ),
  )

  if (valueDigits.negative !== previousDigits.negative) {
    return { digits: addDigits(left, right), scale, negative: valueDigits.negative }
  }

  const comparison = compareDigits(left, right)
  if (comparison === 0) return { digits: '0', scale, negative: false }
  const valueIsLarger = comparison > 0
  return {
    digits: valueIsLarger ? subtractDigits(left, right) : subtractDigits(right, left),
    scale,
    negative: valueIsLarger ? valueDigits.negative : !valueDigits.negative,
  }
}

function formatSignedDecimal(decimal: DecimalDigits, locale: string): string {
  const paddedDigits = decimal.digits.padStart(decimal.scale + 1, '0')
  const integerDigits = decimal.scale === 0 ? paddedDigits : paddedDigits.slice(0, -decimal.scale)
  const fractionDigits =
    decimal.scale === 0 ? '' : paddedDigits.slice(-decimal.scale).replace(/0+$/, '')
  const usesBrazilianSeparators = locale === 'pt-BR'
  const groupSeparator = usesBrazilianSeparators ? '.' : ','
  const decimalSeparator = usesBrazilianSeparators ? ',' : '.'
  const groupedInteger = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator)
  const sign = decimal.negative ? '-' : decimal.digits === '0' ? '' : '+'
  return `${sign}${groupedInteger}${fractionDigits ? `${decimalSeparator}${fractionDigits}` : ''}`
}

type GoalMetricsStatusTone = 'success' | 'warning' | 'danger' | 'muted'

interface GoalMetricsStatusPresentation {
  labelKey: string
  tone: GoalMetricsStatusTone
}

export function formatGoalMetricsDate(dateStr: string, locale: string): string {
  const datePart = dateStr.slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T00:00:00`)
    : new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  return getDateTimeFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatGoalHistoryNumber(
  value: number,
  locale: string,
): string {
  return getNumberFormat(locale, {
    maximumSignificantDigits: GOAL_HISTORY_MAXIMUM_SIGNIFICANT_DIGITS,
  }).format(value)
}

export function formatGoalHistoryDelta(
  previousValue: number,
  value: number,
  locale: string,
): string {
  return formatSignedDecimal(subtractDecimalValues(previousValue, value), locale)
}

export function getGoalMetricsStatusPresentation(
  trackingStatus: string | null | undefined,
): GoalMetricsStatusPresentation | null {
  switch (trackingStatus) {
    case 'on_track':
      return { labelKey: 'goals.metrics.onTrack', tone: 'success' }
    case 'at_risk':
      return { labelKey: 'goals.metrics.atRisk', tone: 'warning' }
    case 'behind':
      return { labelKey: 'goals.metrics.behind', tone: 'danger' }
    case 'no_deadline':
      return { labelKey: 'goals.metrics.noDeadline', tone: 'muted' }
    default:
      return null
  }
}
