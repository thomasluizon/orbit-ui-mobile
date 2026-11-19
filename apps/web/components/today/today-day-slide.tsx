'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { turnOrbitPage, type CalendarSlideDirection } from '@orbit/shared/utils'
import { CalendarSlide } from '@/components/calendar/calendar-slide'
import { useFlag } from '@/hooks/use-flag'

/** The day change of Hoje: the 12px slide and fade of the calendar in the direction of the new day, and one ring turn of Orbit. Reduced motion shows the new day at once. */
export function TodayDaySlide({ dateStr, enabled, children }: Readonly<{ dateStr: string; enabled: boolean; children: ReactNode }>) {
  const guided = useFlag('orbit_guided_flows') && enabled
  const [shown, setShown] = useState<{ dateStr: string; direction: CalendarSlideDirection | null }>({ dateStr, direction: null })
  if (shown.dateStr !== dateStr) setShown({ dateStr, direction: dateStr > shown.dateStr ? 'right' : 'left' })
  useEffect(() => {
    if (guided && shown.direction) turnOrbitPage()
  }, [guided, shown])
  if (!guided) return <>{children}</>
  return <CalendarSlide direction={shown.direction} stepKey={shown.dateStr}>{children}</CalendarSlide>
}
