'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import type { CalendarCard as CalendarCardData } from '@orbit/shared/types/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import { EventRow } from '@/components/dates/event-row'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { Plus } from '@/components/ui/icons'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useProfile } from '@/hooks/use-profile'
import { useCalendars } from '@/hooks/use-calendars'
import { useCalendarEvents } from '@/hooks/use-calendar-events'

export function CalendarCard({ calendarCard }: Readonly<{ calendarCard: CalendarCardData }>) {
  const t = useTranslations()
  const { displayClock } = useTimeFormat()
  const router = useRouter()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const calendars = useCalendars({ enabled: hasProAccess })
  const eventsQuery = useCalendarEvents({ enabled: hasProAccess, timeZone: profile?.timeZone ?? null })
  const [acting, setActing] = useState(false)
  const liveEvents = eventsQuery.data?.status === 'connected' ? eventsQuery.data.events : undefined
  const missing = liveEvents != null && calendarCard.events.some((event) => event.id != null && !liveEvents.some((live) => live.id === event.id))
  const frameState = liveBlockState(eventsQuery, { acting, failed: calendarCard.sync?.enabled && calendarCard.sync.status !== 'Idle', stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void eventsQuery.refetch() } })
  const items: BlockFrameItem[] = []
  if (calendarCard.sync) {
    const failed = calendarCard.sync.enabled && calendarCard.sync.status !== 'Idle'
    items.push({ id: 'sync', label: t('chat.calendarCard.sync'),
      meta: failed ? undefined : t(calendarCard.sync.enabled ? `chat.calendarCard.syncState.${calendarCard.sync.status}` : 'chat.calendarCard.syncState.disabled'),
      ...(failed ? { status: 'failed' as const, statusLabel: t(`chat.calendarCard.syncState.${calendarCard.sync.status}`) } : {}),
    })
  }
  if (!hasProAccess) return null
  return <div className="w-full">
    <BlockFrame {...frameState} title={t('chat.calendarCard.title')} count={calendarCard.events.length} items={items}
      body={calendarCard.events.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.calendarCard.empty')}</p> : <div className="flex flex-col gap-3">{calendarCard.events.map((event, index) => {
        const eventId = event.id
        const live = liveEvents?.find((entry) => entry.id === event.id)
        const title = live?.title ?? event.title
        const allDay = live ? live.startTime == null : event.isAllDay
        const source = (calendars.data?.length ?? 0) > 1 ? live?.calendarName ?? event.calendarName ?? undefined : undefined
        const timing = allDay ? { allDayLabel: t('chat.calendarCard.allDay') } : { time: displayClock(live?.startTime ?? event.start) }
        return <div className="flex min-w-0 flex-col gap-1" key={event.id ?? index}>
          <EventRow title={title} {...timing} source={source} />
          {eventId ? <div className="flex justify-end"><Button variant="ghost" size="sm" iconOnly minimumHeight={TOUCH_TARGET_MIN} label={t('chat.calendarCard.makeHabit', { title })} disabled={acting || eventsQuery.isError || missing} onClick={() => { setActing(true); router.push(`/calendar?import=1&event=${encodeURIComponent(eventId)}`) }}><Plus size={20} aria-hidden="true" /></Button></div> : null}
        </div>
      })}</div>}
      actions={<>{eventsQuery.isError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}<Button variant="ghost" size="sm" onClick={() => { setActing(true); router.push('/calendar') }}>{t('chat.calendarCard.open')}</Button></>} />
  </div>
}
