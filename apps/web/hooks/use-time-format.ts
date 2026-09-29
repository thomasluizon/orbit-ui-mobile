'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import { createTimeDisplay } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

export function useTimeFormat() {
  const locale = useLocale()
  const { profile } = useProfile()
  const uses24HourClock = profile?.uses24HourClock
  return useMemo(() => createTimeDisplay(locale, uses24HourClock), [locale, uses24HourClock])
}
