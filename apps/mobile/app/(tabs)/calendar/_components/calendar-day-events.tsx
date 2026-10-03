import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarSyncEvent } from '@orbit/shared'
import { EventRow } from '@/components/dates/event-row'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function CalendarDayEvents({ calendarEvents, showEventSource, onOpenImport, t, displayTime }: Readonly<{
  t: TFunction
  displayTime: (time: string) => string
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  onOpenImport: (eventId: string | null) => void
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { sheetRef, closeSheet } = useSheetHost()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const matchingEvents = calendarEvents.filter((event) => event.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const openEvent = (eventId: string) => {
    if (open) closeSheet(() => { setOpen(false); onOpenImport(eventId) })
    else onOpenImport(eventId)
  }
  const eventRows = (events: CalendarSyncEvent[]) => events.map((event) => <EventRow
    key={event.id} title={event.title}
    {...(event.startTime ? { time: displayTime(event.startTime) } : { allDayLabel: t('calendar.timeGrid.allDay') })}
    source={showEventSource ? event.calendarName : undefined}
    onClick={() => openEvent(event.id)}
  />)
  return <>
    <View style={styles.list}>{eventRows(calendarEvents.slice(0, 3))}</View>
    {/* eslint-disable-next-line local/max-button-words -- #1143 requires this event disclosure label. */}
    {calendarEvents.length > 3 ? <ListRow inset={false} textMode="label" title={t('calendar.dayDetail.viewAllEvents', { count: calendarEvents.length })} onClick={() => setOpen(true)} /> : null}
    {open ? <Sheet ref={sheetRef} open title={t('calendar.dayDetail.eventsTitle')} onClose={() => setOpen(false)}>
      <View style={styles.list}>
        {calendarEvents.length > 20 ? <Input label={t('calendar.dayDetail.searchEvents')} value={query} onChange={(value) => { setQuery(value); setVisibleCount(20) }} autoComplete="off" /> : null}
        {eventRows(matchingEvents.slice(0, visibleCount))}
        {matchingEvents.length === 0 ? <>
          <Text style={[styles.empty, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noMatchingEvents', { query: query.trim() })}</Text>
          <ListRow inset={false} textMode="label" title={t('calendar.dayDetail.clearEventSearch')} onClick={() => setQuery('')} />
        </> : null}
        {matchingEvents.length > visibleCount ? <ListRow inset={false} textMode="label" title={t('calendar.showMore')} onClick={() => setVisibleCount((count) => count + 20)} /> : null}
      </View>
    </Sheet> : null}
  </>
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  empty: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
})
