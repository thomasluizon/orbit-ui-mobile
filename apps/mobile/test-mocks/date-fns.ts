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

export function isSameDay(left: Date | number | string, right: Date | number | string): boolean {
  const leftDate = toDate(left)
  const rightDate = toDate(right)
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  )
}

export function isAfter(left: Date | number | string, right: Date | number | string): boolean {
  return toDate(left).getTime() > toDate(right).getTime()
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

export function addDays(dateInput: Date | number | string, amount: number): Date {
  const date = toDate(dateInput)
  return new Date(date.getTime() + amount * 86400000)
}

export function addWeeks(dateInput: Date | number | string, amount: number): Date {
  return addDays(dateInput, amount * 7)
}

export function subWeeks(dateInput: Date | number | string, amount: number): Date {
  return addDays(dateInput, -amount * 7)
}

export function getDate(dateInput: Date | number | string): number {
  return toDate(dateInput).getDate()
}

export function getDay(dateInput: Date | number | string): number {
  return toDate(dateInput).getDay()
}

export function getHours(dateInput: Date | number | string): number {
  return toDate(dateInput).getHours()
}

export function getMinutes(dateInput: Date | number | string): number {
  return toDate(dateInput).getMinutes()
}

export function setYear(dateInput: Date | number | string, year: number): Date {
  const date = toDate(dateInput)
  const result = new Date(date)
  result.setFullYear(year)
  return result
}

export function isSameMonth(
  left: Date | number | string,
  right: Date | number | string,
): boolean {
  const leftDate = toDate(left)
  const rightDate = toDate(right)
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth()
  )
}

export function startOfWeek(
  dateInput: Date | number | string,
  options?: { weekStartsOn?: number },
): Date {
  const date = toDate(dateInput)
  const weekStartsOn = options?.weekStartsOn ?? 0
  const day = date.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff)
  return result
}

export function endOfWeek(
  dateInput: Date | number | string,
  options?: { weekStartsOn?: number },
): Date {
  const start = startOfWeek(dateInput, options)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
}

export function eachDayOfInterval(interval: {
  start: Date | number | string
  end: Date | number | string
}): Date[] {
  const start = toDate(interval.start)
  const end = toDate(interval.end)
  const days: Date[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor.getTime() <= last.getTime()) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
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
