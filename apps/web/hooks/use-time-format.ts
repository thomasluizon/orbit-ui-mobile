'use client'

import { useCallback, useMemo } from 'react'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useDeviceLocale } from './use-device-locale'

export function useTimeFormat() {
  const locale = useDeviceLocale()

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      return formatLocaleTime(time, locale)
    },
    [locale],
  )

  return useMemo(() => ({ displayTime, locale }), [displayTime, locale])
}
