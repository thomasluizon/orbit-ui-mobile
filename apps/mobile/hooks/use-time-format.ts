import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createTimeDisplay } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useTimeFormat() {
  const { i18n } = useTranslation()
  const { profile } = useProfile()
  const locale = i18n.language
  const uses24HourClock = profile?.uses24HourClock
  const timeZone = profile?.timeZone
  return useMemo(() => ({ ...createTimeDisplay(locale, uses24HourClock), displayReminderClock: createTimeDisplay(locale, uses24HourClock, timeZone ?? null).displayClock }), [locale, uses24HourClock, timeZone])
}
