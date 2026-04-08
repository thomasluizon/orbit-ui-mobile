import { useState, useCallback, useMemo, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
  const [currentFormat, setCurrentFormat] = useState<TimeFormat>(detectDefaultTimeFormat)

  // Load saved format on init
  useEffect(() => {
    AsyncStorage.getItem(TIME_FORMAT_STORAGE_KEY).then((saved) => {
      if (isTimeFormat(saved)) {
        setCurrentFormat(saved)
      }
    })
  }, [])

  const setFormat = useCallback((fmt: TimeFormat) => {
    setCurrentFormat(fmt)
    AsyncStorage.setItem(TIME_FORMAT_STORAGE_KEY, fmt)
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
