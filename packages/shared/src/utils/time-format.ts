export type TimeFormat = '12h' | '24h'

export const TIME_FORMAT_STORAGE_KEY = 'orbit_time_format'

export function isTimeFormat(value: string | null | undefined): value is TimeFormat {
  return value === '12h' || value === '24h'
}

export function detectDefaultTimeFormat(): TimeFormat {
  try {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as {
      hour12?: boolean
    }
    return resolved.hour12 ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

export function formatTime(time: string, format: TimeFormat): string {
  if (!time || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return time
  }

  const normalized = time.slice(0, 5)
  if (format === '24h') {
    return normalized
  }

  const [hourValue, minuteValue] = normalized.split(':').map(Number)
  const hour = hourValue ?? 0
  const minute = minuteValue ?? 0
  const period = hour >= 12 ? 'PM' : 'AM'

  let hour12 = hour
  if (hour12 === 0) {
    hour12 = 12
  } else if (hour12 > 12) {
    hour12 -= 12
  }

  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}
