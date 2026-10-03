import { useAccountScopedState } from '@/hooks/use-session-reset'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarSyncEvent } from '@orbit/shared'
import { EventRow } from '@/components/dates/event-row'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

import { plural } from '@/lib/plural'

export function CalendarDayEvents({ calendarEvents, showEventSource, onOpenImport, onOpenEvents, sheetOnly = false, open: controlledOpen, onClose, t, displayTime }: Readonly<{
  t: TFunction
  displayTime: (time: string) => string
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  onOpenImport: (eventId: string | null) => void
  onOpenEvents?: () => void
  sheetOnly?: boolean
  open?: boolean
  onClose?: () => void
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
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
    <View style={[styles.list, { paddingHorizontal: 8 }]}>{sheetOnly ? null : eventRows(calendarEvents.slice(0, 3))}</View>
    {!sheetOnly && calendarEvents.length > 3 ? <ListRow textMode="label" title={t('calendar.dayDetail.viewAllEventsLabel')} value={`(${calendarEvents.length})`} accessibilityLabel={t('calendar.dayDetail.viewAllEvents', { count: calendarEvents.length })} onClick={onOpenEvents ?? (() => setLocalOpen(true))} /> : null}
    {open ? <Sheet ref={sheetRef} open title={t('calendar.dayDetail.eventsTitle')} onClose={finishClose}>
      <View style={styles.list}>
        {calendarEvents.length >= 8 ? <Text style={[styles.count, { color: tokens.fg3 }]}>{plural(t('calendar.eventsFound', { count: calendarEvents.length }), calendarEvents.length)}</Text> : null}
        {calendarEvents.length > 20 ? <Input label={t('calendar.dayDetail.searchEvents')} value={query} onChange={(value) => { setQuery(value); setVisibleCount(20) }} autoComplete="off" /> : null}
        {eventRows(matchingEvents.slice(0, visibleCount))}
        {matchingEvents.length === 0 ? <>
          <Text style={[styles.empty, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noMatchingEvents', { query: query.trim() })}</Text>
          <ListRow textMode="label" title={t('calendar.dayDetail.clearEventSearch')} onClick={() => setQuery('')} />
        </> : null}
        {matchingEvents.length > visibleCount ? <ListRow textMode="label" title={t('calendar.showMore')} onClick={() => setVisibleCount((count) => count + 20)} /> : null}
      </View>
    </Sheet> : null}
  </>
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, fontVariant: ['tabular-nums'] },
  empty: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
})
