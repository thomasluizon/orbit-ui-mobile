'use client'

import { useTranslations } from 'next-intl'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { liveBlockState, calendarBlockErrorKey } from '@orbit/shared/chat/live-block-state'
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
  const navigate = useChatNavigation()
  const { profile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const calendars = useCalendars({ enabled: hasProAccess })
  const eventsQuery = useCalendarEvents({ enabled: hasProAccess, timeZone: profile?.timeZone ?? null })
  const liveEvents = eventsQuery.data?.status === 'connected' ? eventsQuery.data.events : undefined
  const notConnected = eventsQuery.data?.status === 'not-connected'
  const syncFailed = calendarCard.sync?.enabled === true && calendarCard.sync.status !== 'Idle'
  const missing = liveEvents != null && calendarCard.events.some((event) => event.id != null && !liveEvents.some((live) => live.id === event.id))
  const errorKey = calendarBlockErrorKey(eventsQuery.isError, notConnected, calendarCard.sync)
  const frameState = liveBlockState(eventsQuery, { failed: errorKey !== null, stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void eventsQuery.refetch() } })
  const items: BlockFrameItem[] = calendarCard.events.map((event, index) => {
    const eventId = event.id
    const live = liveEvents?.find((entry) => entry.id === eventId)
    const title = live?.title ?? event.title
    const allDay = live ? live.startTime == null : event.isAllDay
    const source = (calendars.data?.length ?? 0) > 1 ? live?.calendarName ?? event.calendarName ?? undefined : undefined
    const timing = allDay ? { allDayLabel: t('chat.calendarCard.allDay') } : { time: displayClock(live?.startTime ?? event.start) }
    return { id: eventId ?? `event-${index}`, wrapLabel: true, label: <EventRow title={title} {...timing} source={source}
      action={eventId ? <Button variant="ghost" size="sm" iconOnly minimumHeight={TOUCH_TARGET_MIN} label={t('chat.calendarCard.makeHabit', { title })} disabled={notConnected || eventsQuery.isError || missing} onClick={() => navigate(`/calendar?import=1&event=${encodeURIComponent(eventId)}`)}><Plus size={20} aria-hidden="true" /></Button> : null} /> }
  })
  if (calendarCard.sync) {
    const failed = syncFailed
    items.push({ id: 'sync', label: t('chat.calendarCard.sync'),
      meta: failed ? undefined : t(calendarCard.sync.enabled ? `chat.calendarCard.syncState.${calendarCard.sync.status}` : 'chat.calendarCard.syncState.disabled'),
      ...(failed ? { status: 'failed' as const, statusLabel: t(`chat.calendarCard.syncState.${calendarCard.sync.status}`) } : {}),
    })
  }
  if (!hasProAccess) return null
  return <div className="w-full">
    <BlockFrame {...frameState} title={t('chat.calendarCard.title')} count={calendarCard.events.length} items={items}
      body={calendarCard.events.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.calendarCard.empty')}</p> : undefined}
      actions={<>{errorKey ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t(errorKey)}</p> : null}<Button variant="ghost" size="sm" onClick={() => navigate(notConnected ? '/calendar?import=1' : '/calendar')}>{t('chat.calendarCard.open')}</Button></>} />
  </div>
}
