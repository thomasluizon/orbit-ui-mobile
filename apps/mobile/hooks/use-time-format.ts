import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocaleTime, formatLocaleDateTime, resolveHourCycle } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useTimeFormat() {
  const { i18n } = useTranslation()
  const { profile } = useProfile()
  const locale = i18n.language
  const hourCycle = resolveHourCycle(profile?.uses24HourClock, locale)

  const displayTime = useCallback(
    (time: string | null | undefined): string => time
      ? formatLocaleTime(time, locale, { hour: 'numeric', minute: '2-digit', hourCycle })
      : '',
    [locale, hourCycle],
  )
  const displayClock = useCallback(
    (value: Date | string): string => formatLocaleDateTime(value, locale, {
      hour: 'numeric', minute: '2-digit', hourCycle,
    }),
    [locale, hourCycle],
  )

  return useMemo(() => ({ displayTime, displayClock, hourCycle, locale }), [displayTime, displayClock, hourCycle, locale])
}
