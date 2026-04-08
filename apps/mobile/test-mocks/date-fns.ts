const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatShortDate(date: Date, localePattern: 'en' | 'pt'): string {
  const day = date.getDate()
  const month = MONTHS_SHORT[date.getMonth()]!
  const year = date.getFullYear()
  return localePattern === 'pt' ? `${pad(day)} ${month.toLowerCase()} ${year}` : `${month} ${day}, ${year}`
}

export function parseISO(value: string): Date {
  return new Date(value)
}

export function parse(value: string, _pattern: string, _referenceDate: Date): Date {
  return new Date(value)
}

export function format(dateInput: Date | number | string, pattern: string): string {
  const date = toDate(dateInput)
  if (Number.isNaN(date.getTime())) return ''

  switch (pattern) {
    case 'yyyy-MM-dd':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    case 'MMM d, yyyy':
      return formatShortDate(date, 'en')
    case 'dd MMM yyyy':
      return formatShortDate(date, 'pt')
    default:
      return date.toISOString()
  }
}

export function differenceInDays(left: Date | number | string, right: Date | number | string): number {
  const diff = toDate(left).getTime() - toDate(right).getTime()
  return Math.floor(diff / 86400000)
}

export function differenceInCalendarDays(left: Date | number | string, right: Date | number | string): number {
  return differenceInDays(left, right)
}

export function addMonths(dateInput: Date | number | string, amount: number): Date {
  const date = toDate(dateInput)
  const result = new Date(date)
  result.setMonth(result.getMonth() + amount)
  return result
}

export function subMonths(dateInput: Date | number | string, amount: number): Date {
  return addMonths(dateInput, -amount)
}

export function endOfMonth(dateInput: Date | number | string): Date {
  const date = toDate(dateInput)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function startOfMonth(dateInput: Date | number | string): Date {
  const date = toDate(dateInput)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function isToday(dateInput: Date | number | string): boolean {
  const date = toDate(dateInput)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function isYesterday(dateInput: Date | number | string): boolean {
  return differenceInCalendarDays(dateInput, new Date()) === -1
}

export function isTomorrow(dateInput: Date | number | string): boolean {
  return differenceInCalendarDays(dateInput, new Date()) === 1
}

export function subDays(dateInput: Date | number | string, amount: number): Date {
  const date = toDate(dateInput)
  return new Date(date.getTime() - amount * 86400000)
}

export function formatDistanceToNow(dateInput: Date | number | string): string {
  return formatDistanceToNowStrict(dateInput)
}

export function formatDistanceToNowStrict(dateInput: Date | number | string): string {
  const diffDays = Math.abs(differenceInDays(new Date(), dateInput))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day'
  return `${diffDays} days`
}
