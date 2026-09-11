import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocaleTime } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useTimeFormat() {
  const { i18n } = useTranslation()
  const { profile } = useProfile()
  const uses24HourClock = profile?.uses24HourClock

  const displayTime = useCallback(
    (time: string | null | undefined): string => {
      if (!time) return ''
      if (uses24HourClock === undefined) return ''
      return formatLocaleTime(time, i18n.language, {
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: uses24HourClock ? 'h23' : 'h12',
      })
    },
    [i18n.language, uses24HourClock],
  )

  return useMemo(
    () => ({ displayTime, locale: i18n.language }),
    [displayTime, i18n.language],
  )
}
