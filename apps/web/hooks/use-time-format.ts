'use client'

import { useState, useCallback, useMemo } from 'react'

export type TimeFormat = '12h' | '24h'

function detectDefaultFormat(): TimeFormat {
  if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') return '24h'
  try {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    return (resolved as { hour12?: boolean }).hour12 ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

export function formatTime(time: string, fmt: TimeFormat): string {
  if (!time || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return time
  const normalized = time.slice(0, 5) // Strip seconds if present (HH:mm:ss -> HH:mm)
  if (fmt === '24h') return normalized
  const [h, m] = normalized.split(':').map(Number)
  const period = (h ?? 0) >= 12 ? 'PM' : 'AM'
  let hour12 = h ?? 0
  if (hour12 === 0) hour12 = 12
  else if (hour12 > 12) hour12 = hour12 - 12
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

export function useTimeFormat() {
  const [currentFormat, setCurrentFormat] = useState<TimeFormat>(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return '24h'
    return (localStorage.getItem('orbit_time_format') as TimeFormat) ?? detectDefaultFormat()
  })

  const setFormat = useCallback((fmt: TimeFormat) => {
    setCurrentFormat(fmt)
    localStorage.setItem('orbit_time_format', fmt)
  }, [])

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      return formatTime(time, currentFormat)
    },
    [currentFormat],
  )

  return useMemo(
    () => ({ currentFormat, setFormat, displayTime }),
    [currentFormat, setFormat, displayTime],
  )
}
