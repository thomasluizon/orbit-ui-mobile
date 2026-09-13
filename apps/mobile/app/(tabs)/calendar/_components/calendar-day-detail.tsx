import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import {
  determineHabitDayStatus,
  parseAPIDate,
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import { CheckRow } from '@/components/ui/check-row'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'
import { EventRow } from '@/components/dates/event-row'
import { createTokensV2, radius } from '@/lib/theme'
import { ShowRecurringToggle } from './show-recurring-toggle'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  selectedDate: string
  selectedEntries: CalendarDayEntry[]
  filteredEntries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  calendarEventsState: CalendarEventsDisplayState
  onRetryCalendarEvents: () => void
  onReconnectCalendarEvents: () => void
  completedCount: number
  loggable: boolean
  showRecurring: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onShowRecurringChange: (value: boolean) => void
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onGoToDay: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
}

function CalendarEventsSection({
  calendarEvents,
  state,
  onRetry,
  onReconnect,
  displayTime,
  t,
  tokens,
  styles,
}: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
  styles: ReturnType<typeof createStyles>
}>) {
  if (state === 'hidden') return null

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
          action={<PillButton variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>}
        />
      ) : null}
      {state === 'not-connected' ? (
        <View style={styles.reconnectState}>
          <Text style={[styles.reconnectTitle, { color: tokens.fg1 }]}>
            {t('calendar.autoSync.reconnectTitle')}
          </Text>
          <Text style={[styles.reconnectBody, { color: tokens.fg3 }]}>
            {t('calendar.autoSync.reconnectBody')}
          </Text>
          <PillButton variant="ghost" onClick={onReconnect}>
            {t('calendar.autoSync.reconnectCta')}
          </PillButton>
        </View>
      ) : null}
      {state === 'ready' && calendarEvents.length === 0 ? (
        <Text style={[styles.emptyEventText, { color: tokens.fg3 }]}>
          {t('calendar.noEvents')}
        </Text>
      ) : null}
      {state === 'ready' && calendarEvents.length > 0 ? (
        <View style={styles.eventList}>
          {calendarEvents.map((event) =>
            event.startTime ? (
              <EventRow
                key={event.id}
                time={displayTime(event.startTime)}
                title={event.title}
                source={t('calendar.title')}
              />
            ) : (
              <EventRow
                key={event.id}
                allDayLabel={t('calendar.timeGrid.allDay')}
                title={event.title}
                source={t('calendar.title')}
              />
            ),
          )}
        </View>
      ) : null}
    </View>
  )
}

type EntryOutcome = {
  label: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(entry: CalendarDayEntry, t: TFunction): EntryOutcome {
  if (entry.status === 'upcoming') {
    return {
      label: t('calendar.status.upcoming'),
      status: 'empty',
    }
  }

  const completed = entry.status === 'completed'

  if (entry.isBadHabit) {
    return {
      label: t(completed ? 'calendar.status.indulged' : 'calendar.status.resisted'),
      status: completed ? 'bad' : 'done',
    }
  }

  return {
    label: t(completed ? 'calendar.status.completed' : 'calendar.status.missed'),
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
  selectedEntries,
  filteredEntries,
  calendarEvents,
  calendarEventsState,
  onRetryCalendarEvents,
  onReconnectCalendarEvents,
  completedCount,
  loggable,
  showRecurring,
  pendingEntryStates,
  onShowRecurringChange,
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
        {selectedEntries.length > 0 ? (
          <View style={styles.recurringToggleRow}>
            <ShowRecurringToggle
              checked={showRecurring}
              onChange={onShowRecurringChange}
              label={t('calendar.showRecurring')}
              tokens={tokens}
            />
          </View>
        ) : null}

        <Text style={[styles.summaryText, { color: tokens.fg3 }]}>{summary}</Text>

        {filteredEntries.length === 0 ? (
          <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>
            {t('calendar.noHabitsScheduled')}
          </Text>
        ) : null}
      </View>

      {filteredEntries.length > 0 ? (
        <View>
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
                  <StatusRing status={outcome.status} size={24} label={outcome.label} />
                }
                chevron={false}
                readOnly
              />
            )
          })}
        </View>
      ) : null}

      <CalendarEventsSection
        calendarEvents={calendarEvents}
        state={calendarEventsState}
        onRetry={onRetryCalendarEvents}
        onReconnect={onReconnectCalendarEvents}
        displayTime={displayTime}
        t={t}
        tokens={tokens}
        styles={styles}
      />

      <ListRow
        icon="external-link"
        title={t('calendar.goToDay')}
        accessibilityLabel={t('calendar.goToDay')}
        chevron={false}
        onClick={onGoToDay}
      />
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
      paddingVertical: 16,
    },
    copyBlock: {
      gap: 16,
      paddingHorizontal: 16,
    },
    recurringToggleRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
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
      paddingHorizontal: 16,
    },
    eventTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      lineHeight: 20,
    },
    eventList: {
      gap: 4,
    },
    reconnectState: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 24,
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
  })
}
