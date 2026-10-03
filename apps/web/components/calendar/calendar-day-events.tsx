'use client'

import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslations } from 'next-intl'
import type { CalendarSyncEvent } from '@orbit/shared'
import { EventRow } from '@/components/dates/event-row'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useTimeFormat } from '@/hooks/use-time-format'

import { plural } from '@/lib/plural'

export function CalendarDayEvents({ calendarEvents, showEventSource, onOpenImport, onOpenEvents, sheetOnly = false, open: controlledOpen, onClose }: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  onOpenImport: (eventId: string | null) => void
  onOpenEvents?: () => void
  sheetOnly?: boolean
  open?: boolean
  onClose?: () => void
}>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const { sheetRef, closeSheet } = useSheetHost()
  const [localOpen, setLocalOpen] = useAccountScopedState(false)
  const open = controlledOpen ?? localOpen
  const finishClose = () => { setLocalOpen(false); onClose?.() }
  const [query, setQuery] = useAccountScopedState('')
  const [visibleCount, setVisibleCount] = useAccountScopedState(20)
  const matchingEvents = calendarEvents.filter((event) => event.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const openEvent = (eventId: string) => {
    if (open) closeSheet(() => { finishClose(); onOpenImport(eventId) })
    else onOpenImport(eventId)
  }
  const eventRows = (events: CalendarSyncEvent[]) => events.map((event) => <EventRow
    key={event.id} title={event.title}
    {...(event.startTime ? { time: displayTime(event.startTime) } : { allDayLabel: t('calendar.timeGrid.allDay') })}
    source={showEventSource ? event.calendarName : undefined}
    onClick={() => openEvent(event.id)}
  />)
  return <>
    <div className="flex flex-col gap-2 px-2">{sheetOnly ? null : eventRows(calendarEvents.slice(0, 3))}</div>
    {/* eslint-disable-next-line local/max-button-words -- #1143 requires this event disclosure label. */}
    {!sheetOnly && calendarEvents.length > 3 ? <ListRow textMode="label" title={t('calendar.dayDetail.viewAllEvents', { count: calendarEvents.length })} onClick={onOpenEvents ?? (() => setLocalOpen(true))} /> : null}
    {open ? <Sheet ref={sheetRef} open title={t('calendar.dayDetail.eventsTitle')} onClose={finishClose}>
      <div className="flex flex-col gap-2">
        {calendarEvents.length >= 8 ? <p className="m-0 font-mono text-xs tabular-nums text-[var(--fg-3)]">{plural(t('calendar.eventsFound', { count: calendarEvents.length }), calendarEvents.length)}</p> : null}
        {calendarEvents.length > 20 ? <Input label={t('calendar.dayDetail.searchEvents')} value={query} onChange={(value) => { setQuery(value); setVisibleCount(20) }} autoComplete="off" name="calendar-event-search" /> : null}
        {eventRows(matchingEvents.slice(0, visibleCount))}
        {matchingEvents.length === 0 ? <>
          <p className="text-sm text-[var(--fg-3)]">{t('calendar.dayDetail.noMatchingEvents', { query: query.trim() })}</p>
          <ListRow textMode="label" title={t('calendar.dayDetail.clearEventSearch')} onClick={() => setQuery('')} />
        </> : null}
        {matchingEvents.length > visibleCount ? <ListRow textMode="label" title={t('calendar.showMore')} onClick={() => setVisibleCount((count) => count + 20)} /> : null}
      </div>
    </Sheet> : null}
  </>
}
