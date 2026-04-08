'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  detectDefaultTimeFormat,
  formatTime,
  isTimeFormat,
  TIME_FORMAT_STORAGE_KEY,
  type TimeFormat,
} from '@orbit/shared/utils'

export type { TimeFormat } from '@orbit/shared/utils'
export { formatTime } from '@orbit/shared/utils'

export function useTimeFormat() {
  const [currentFormat, setCurrentFormat] = useState<TimeFormat>(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
      return '24h'
    }

    const savedFormat = localStorage.getItem(TIME_FORMAT_STORAGE_KEY)
    if (isTimeFormat(savedFormat)) {
      return savedFormat
    }

    return detectDefaultTimeFormat()
  })

  const setFormat = useCallback((fmt: TimeFormat) => {
    setCurrentFormat(fmt)
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, fmt)
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
