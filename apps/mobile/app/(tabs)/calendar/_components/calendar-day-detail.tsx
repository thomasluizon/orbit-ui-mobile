import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import {
  determineHabitDayStatus,
  isCalendarSyncConnectionActive,
  parseAPIDate,
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import { CheckRow } from '@/components/ui/check-row'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'
import { EventRow } from '@/components/dates/event-row'
import { Input } from '@/components/ui/input'
import { useOffline } from '@/hooks/use-offline'
import { plural } from '@/lib/plural'
import { createTokensV2, radius } from '@/lib/theme'
import { CalendarSyncBoundary } from './calendar-sync-boundary'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  selectedDate: string
  title: string
  showTitle?: boolean
  filteredEntries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  autoSyncState: CalendarAutoSyncState | undefined
  calendarEventsState: CalendarEventsDisplayState
  onRetryCalendarEvents: () => void
  onReconnectCalendarEvents: () => void
  onOpenCalendarImport: (eventId: string | null) => void
  onViewPro: () => void
  completedCount: number
  loggable: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onCalendarAutoSyncChange: (value: boolean) => Promise<void>
  onCalendarSyncNow: () => Promise<void>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onGoToDay: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
}

function CalendarReadyEvents({ calendarEvents, onOpenImport, displayTime, t, tokens, styles }: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  onOpenImport: (eventId: string | null) => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
  styles: ReturnType<typeof createStyles>
}>) {
  const [eventQuery, setEventQuery] = useState('')
  const [eventPage, setEventPage] = useState(0)
  const matchingEvents = useMemo(() => calendarEvents.filter((event) =>
    event.title.toLocaleLowerCase().includes(eventQuery.trim().toLocaleLowerCase()),
  ), [calendarEvents, eventQuery])
  const currentPage = Math.min(eventPage, Math.max(0, Math.ceil(matchingEvents.length / 20) - 1))
  const visibleEvents = matchingEvents.slice(currentPage * 20, (currentPage + 1) * 20)

  return <View style={styles.eventList}>
    {calendarEvents.length > 20 ? (
      <Input label={t('calendar.dayDetail.searchEvents')} value={eventQuery} onChange={(value) => { setEventQuery(value); setEventPage(0) }} autoComplete="off" />
    ) : null}
    {visibleEvents.map((event) => (
      <View key={event.id} style={styles.eventList}>
        {event.startTime ? (
          <EventRow time={displayTime(event.startTime)} title={event.title} source={event.calendarName || t('calendar.title')} />
        ) : (
          <EventRow allDayLabel={t('calendar.timeGrid.allDay')} title={event.title} source={event.calendarName || t('calendar.title')} />
        )}
        {!event.isImported ? <PillButton variant="ghost" accessibleName={`${plural(t('calendar.importButton', { count: 1 }), 1)}: ${event.title}`} onClick={() => onOpenImport(event.id)}>
          {plural(t('calendar.importButton', { count: 1 }), 1)}
        </PillButton> : null}
      </View>
    ))}
    {matchingEvents.length === 0 ? <View style={styles.eventList}><Text style={[styles.emptyEventText, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noMatchingEvents', { query: eventQuery.trim() })}</Text><PillButton variant="ghost" size="sm" onClick={() => setEventQuery('')}>{t('calendar.dayDetail.clearEventSearch')}</PillButton></View> : null}
    {calendarEvents.length > 20 ? (
      <View style={styles.eventPager}>
        <Text style={[styles.eventCount, { color: tokens.fg3 }]}>{t('calendar.showingCount', { shown: Math.min((currentPage + 1) * 20, matchingEvents.length), total: matchingEvents.length })}</Text>
        {matchingEvents.length > 20 ? <View style={styles.eventPageActions}>
          <PillButton variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setEventPage(currentPage - 1)}>{t('common.previous')}</PillButton>
          <PillButton variant="ghost" size="sm" disabled={(currentPage + 1) * 20 >= matchingEvents.length} onClick={() => setEventPage(currentPage + 1)}>{t('common.next')}</PillButton>
        </View> : null}
      </View>
    ) : null}
    <PillButton variant="ghost" onClick={() => onOpenImport(null)}>{t('calendar.calendars.title')}</PillButton>
  </View>
}

function CalendarEventsSection({
  calendarEvents,
  state,
  onRetry,
  onReconnect,
  onOpenImport,
  onViewPro,
  displayTime,
  t,
  tokens,
  styles,
}: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  onOpenImport: (eventId: string | null) => void
  onViewPro: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
  styles: ReturnType<typeof createStyles>
}>) {
  const { isOnline } = useOffline()
  if (state === 'pro-boundary') {
    return (
      <View testID="calendar-pro-boundary" style={styles.proBoundary}>
        <CapacityNotice
          message={t('calendar.proBoundary.title')}
          body={t('calendar.proBoundary.body')}
          action={
            /* eslint-disable-next-line local/max-button-words -- ORB-50 owns this granted canvas label. */
            <PillButton size="sm" onClick={onViewPro}>
              {t('calendar.proBoundary.action')}
            </PillButton>
          }
        />
      </View>
    )
  }

  return (
    <View style={styles.eventSection}>
      <Text style={[styles.eventTitle, { color: tokens.fg2 }]}>
        {t('calendar.dayDetail.eventsTitle')}
      </Text>
      {state === 'loading' ? (
        <Skeleton variant="settings" rows={1} label={t('calendar.fetchingEvents')} />
      ) : null}
      {state === 'failed' ? (
        <ErrorState
          message={t('calendar.fetchError')}
          action={
            <PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
          }
        />
      ) : null}
      {state === 'not-connected' ? (
        <View style={styles.reconnectState}>
          <Text style={[styles.reconnectTitle, { color: tokens.fg1 }]}>
            {t(isOnline ? 'calendar.dayDetail.disconnectedTitle' : 'offline.calendar.title')}
          </Text>
          <Text style={[styles.reconnectBody, { color: tokens.fg3 }]}>
            {t(isOnline ? 'calendar.dayDetail.disconnectedBody' : 'offline.calendar.reason')}
          </Text>
          {isOnline ? <PillButton variant="ghost" onClick={onReconnect}>
            {t('calendar.autoSync.reconnectCta')}
          </PillButton> : null}
        </View>
      ) : null}
      {state === 'ready' && calendarEvents.length === 0 ? (
        <View style={styles.reconnectState}>
          <Text style={[styles.emptyEventText, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noEventsToImport')}</Text>
          <PillButton variant="ghost" onClick={() => onOpenImport(null)}>{t('calendar.calendars.title')}</PillButton>
        </View>
      ) : null}
      {state === 'ready' && calendarEvents.length > 0 ? (
        <CalendarReadyEvents calendarEvents={calendarEvents} onOpenImport={onOpenImport} displayTime={displayTime} t={t} tokens={tokens} styles={styles} />
      ) : null}
    </View>
  )
}

type EntryOutcome = {
  label: string
  ringLabel: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(entry: CalendarDayEntry, t: TFunction): EntryOutcome {
  const completed = entry.status === 'completed'

  if (entry.isBadHabit) {
    const label = t(completed ? 'calendar.status.indulged' : 'calendar.status.resisted')
    return {
      label,
      ringLabel: entry.status === 'upcoming' ? t('calendar.status.missed') : label,
      status: completed ? 'bad' : entry.status === 'upcoming' ? 'empty' : 'done',
    }
  }

  const label = t(completed ? 'calendar.status.completed' : 'calendar.status.missed')
  return {
    label,
    ringLabel: label,
    status: completed ? 'done' : 'empty',
  }
}

function CalendarDayCheckRow({
  selectedDate,
  entry,
  displayTime,
  isPending,
  pendingChecked,
  onEntryChange,
  t,
}: Readonly<{
  selectedDate: string
  entry: CalendarDayEntry
  displayTime: (time: string) => string
  isPending: boolean
  pendingChecked: boolean | undefined
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  t: TFunction
}>) {
  const sourceChecked = entry.status === 'completed'
  const displayedChecked = pendingChecked === undefined || pendingChecked === sourceChecked
    ? null
    : pendingChecked
  const checked = displayedChecked ?? sourceChecked
  const displayedEntry: CalendarDayEntry = displayedChecked === null
    ? entry
    : {
        ...entry,
        status: displayedChecked
          ? 'completed'
          : determineHabitDayStatus(parseAPIDate(selectedDate), false),
      }
  const outcome = getEntryOutcome(displayedEntry, t)
  const value = entry.dueTime
    ? `${displayTime(entry.dueTime)} · ${outcome.label}`
    : outcome.label

  async function changeChecked(nextChecked: boolean) {
    const entryChange = onEntryChange(entry, nextChecked)
    if (!entryChange) return
    await entryChange.catch(() => undefined)
  }

  return (
    <CheckRow
      label={entry.title}
      checked={checked}
      value={value}
      loading={isPending}
      onChange={(nextChecked) => void changeChecked(nextChecked)}
    />
  )
}

export function CalendarDayDetail({
  selectedDate,
  title,
  showTitle = true,
  filteredEntries,
  calendarEvents,
  autoSyncState,
  calendarEventsState,
  onRetryCalendarEvents,
  onReconnectCalendarEvents,
  onOpenCalendarImport,
  onViewPro,
  completedCount,
  loggable,
  pendingEntryStates,
  onCalendarAutoSyncChange,
  onCalendarSyncNow,
  onEntryChange,
  onGoToDay,
  displayTime,
  t,
  tokens,
}: Readonly<CalendarDayDetailProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const summary = filteredEntries.length > 0
    ? t('calendar.dayDetail.completionSummary', {
        done: completedCount,
        total: filteredEntries.length,
      })
    : t('calendar.dayDetail.nothingDue')

  return (
    <View style={styles.container}>
      <View style={styles.copyBlock}>
        {showTitle ? <Text style={[styles.dayTitle, { color: tokens.fg1 }]}>{title}</Text> : null}
        <Text style={[styles.summaryText, { color: tokens.fg3 }]}>{summary}</Text>

        {filteredEntries.length === 0 ? (
          <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
            {t('calendar.noHabitsScheduled')}
          </Text>
        ) : null}
      </View>

      {filteredEntries.length > 0 ? (
        <View style={styles.rowList}>
          {filteredEntries.map((entry) => {
            const entryKey = getCalendarEntryMutationKey(selectedDate, entry.habitId)
            const outcome = getEntryOutcome(entry, t)
            const value = entry.dueTime
              ? `${displayTime(entry.dueTime)} · ${outcome.label}`
              : outcome.label

            if (loggable) {
              return (
                <CalendarDayCheckRow
                  key={`${selectedDate}:${entry.habitId}`}
                  selectedDate={selectedDate}
                  entry={entry}
                  displayTime={displayTime}
                  isPending={pendingEntryStates.has(entryKey)}
                  pendingChecked={pendingEntryStates.get(entryKey)}
                  onEntryChange={onEntryChange}
                  t={t}
                />
              )
            }

            return (
              <ListRow
                key={`${selectedDate}:${entry.habitId}`}
                title={entry.title}
                value={value}
                trailing={
                  <StatusRing status={outcome.status} size={24} label={outcome.ringLabel} />
                }
                chevron={false}
                readOnly
              />
            )
          })}
        </View>
      ) : null}

      <View style={styles.rowList}>
        {/* eslint-disable-next-line local/max-button-words -- #927 follows the granted calendar drawing. */}
        <ListRow
        icon="external-link"
        title={t('calendar.goToDay')}
        wrapTitle
        accessibilityLabel={t('calendar.goToDay')}
        chevron={false}
        onClick={onGoToDay}
        />
      </View>
      <CalendarEventsSection
        key={selectedDate}
        calendarEvents={calendarEvents}
        state={calendarEventsState}
        onRetry={onRetryCalendarEvents}
        onReconnect={onReconnectCalendarEvents}
        onOpenImport={onOpenCalendarImport}
        onViewPro={onViewPro}
        displayTime={displayTime}
        t={t}
        tokens={tokens}
        styles={styles}
      />

      {calendarEventsState !== 'pro-boundary' && calendarEventsState !== 'not-connected' &&
        isCalendarSyncConnectionActive(autoSyncState?.hasGoogleConnection ?? false, autoSyncState?.status ?? 'Idle') ? (
        <View style={styles.syncBoundary}>
          <CalendarSyncBoundary
            autoSyncState={autoSyncState}
            displayTime={displayTime}
            onAutoSyncChange={onCalendarAutoSyncChange}
            onSyncNow={onCalendarSyncNow}
            t={t}
            tokens={tokens}
          />
        </View>
      ) : null}

    </View>
  )
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    container: {
      backgroundColor: tokens.bgCard,
      borderColor: tokens.hairlineGhost,
      borderRadius: radius.xl,
      borderWidth: 1,
      gap: 16,
      paddingVertical: 24,
    },
    copyBlock: {
      gap: 16,
      paddingHorizontal: 24,
    },
    rowList: {
      paddingHorizontal: 8,
    },
    dayTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 20,
    },
    summaryText: {
      color: tokens.fg3,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
    },
    emptyDayText: {
      color: tokens.fg3,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 22,
      paddingVertical: 24,
      textAlign: 'center',
    },
    eventSection: {
      gap: 8,
      paddingHorizontal: 24,
    },
    eventTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      lineHeight: 20,
    },
    eventList: {
      gap: 4,
    },
    eventPager: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'space-between',
    },
    eventPageActions: { flexDirection: 'row', gap: 8 },
    eventCount: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
    reconnectState: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 24,
    },
    proBoundary: {
      paddingHorizontal: 24,
    },
    reconnectTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      textAlign: 'center',
    },
    reconnectBody: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    emptyEventText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 22,
      paddingVertical: 24,
      textAlign: 'center',
    },
    syncBoundary: {
      paddingHorizontal: 24,
    },
  })
}
