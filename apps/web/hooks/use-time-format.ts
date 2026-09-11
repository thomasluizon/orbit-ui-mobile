'use client'

import { useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useTimeFormat() {
  const locale = useLocale()
  const { profile } = useProfile()
  const uses24HourClock = profile?.uses24HourClock

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      if (uses24HourClock === undefined) {
        return formatLocaleTime(time, locale, {
          hour: 'numeric',
          minute: '2-digit',
        })
      }
      return formatLocaleTime(time, locale, {
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: uses24HourClock ? 'h23' : 'h12',
      })
    },
    [locale, uses24HourClock],
  )

  return useMemo(() => ({ displayTime, locale }), [displayTime, locale])
}
