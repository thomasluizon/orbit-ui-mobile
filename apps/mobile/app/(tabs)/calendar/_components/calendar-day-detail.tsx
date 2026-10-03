import { useMemo, useState } from 'react'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import {
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import { CheckRow } from '@/components/ui/check-row'
import { ErrorState } from '@/components/ui/error-state'
import { Badge } from '@/components/ui/badge'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { CalendarDayEvents } from './calendar-day-events'
import { ListRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2, radius } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  selectedDate: string
  title: string
  showTitle?: boolean
  filteredEntries: CalendarDayEntry[]
  calendarEvents: CalendarSyncEvent[]
  showEventSource?: boolean
  calendarEventsState: CalendarEventsDisplayState
  onRetryCalendarEvents: () => void
  onReconnectCalendarEvents: () => void
  onOpenCalendarImport: (eventId: string | null) => void
  onViewPro: () => void
  completedCount: number
  loggable: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onGoToDay: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
}

function CalendarEventsSection({ calendarEvents, showEventSource, state, onRetry, onReconnect, onOpenImport, onViewPro, displayTime, t, tokens, styles }: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  displayTime: (time: string) => string
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  onOpenImport: (eventId: string | null) => void
  onViewPro: () => void
  t: TFunction
  tokens: Tokens
  styles: ReturnType<typeof createStyles>
}>) {
  if (state === 'pro-boundary') return <View testID="calendar-pro-boundary" style={styles.eventSection}>
    <ListRow inset={false} textMode="label" title={t('calendar.calendars.title')} trailing={<Badge>{t('common.proBadge')}</Badge>} onClick={onViewPro} />
  </View>
  if (state === 'not-connected') return <View style={styles.eventSection}>
    <ListRow inset={false} textMode="label" title={t('calendar.calendars.title')} onClick={onReconnect} />
  </View>
  return <View style={styles.eventSection}>
    <Text style={[styles.eventTitle, { color: tokens.fg2 }]}>{t('calendar.dayDetail.eventsTitle')}</Text>
    {state === 'loading' ? <Skeleton variant="settings" rows={1} label={t('calendar.fetchingEvents')} /> : null}
    {state === 'failed' ? <ErrorState message={t('calendar.fetchError')} action={<ListRow inset={false} textMode="label" title={t('common.retry')} onClick={onRetry} />} /> : null}
    {state === 'ready' && calendarEvents.length === 0 ? <Text style={[styles.emptyEventText, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noEventsToImport')}</Text> : null}
    {state === 'ready' && calendarEvents.length > 0 ? <CalendarDayEvents t={t} displayTime={displayTime} calendarEvents={calendarEvents} showEventSource={showEventSource} onOpenImport={onOpenImport} /> : null}
  </View>
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
  entry,
  displayTime,
  isPending,
  pendingChecked,
  onEntryChange,
  onOpenTitle,
}: Readonly<{
  selectedDate: string
  entry: CalendarDayEntry
  displayTime: (time: string) => string
  isPending: boolean
  pendingChecked: boolean | undefined
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onOpenTitle: (title: string) => void
  t: TFunction
}>) {
  const sourceChecked = entry.status === 'completed'
  const displayedChecked = pendingChecked === undefined || pendingChecked === sourceChecked
    ? null
    : pendingChecked
  const checked = displayedChecked ?? sourceChecked
  const value = entry.dueTime ? displayTime(entry.dueTime) : undefined

  async function changeChecked(nextChecked: boolean) {
    const entryChange = onEntryChange(entry, nextChecked)
    if (!entryChange) return
    await entryChange.catch(() => undefined)
  }

  return (
    <CheckRow
      label={entry.title}
      textMode="personal"
      onOpenLabel={() => onOpenTitle(entry.title)}
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
  showEventSource = false,
  calendarEventsState,
  onRetryCalendarEvents,
  onReconnectCalendarEvents,
  onOpenCalendarImport,
  onViewPro,
  completedCount,
  loggable,
  pendingEntryStates,
  onEntryChange,
  onGoToDay,
  displayTime,
  t,
  tokens,
}: Readonly<CalendarDayDetailProps>) {
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null)
  const { sheetRef } = useSheetHost()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const summary = filteredEntries.length > 0
    ? t('calendar.dayDetail.completionSummary', {
        done: completedCount,
        total: filteredEntries.length,
      })
    : t('calendar.dayDetail.nothingDue')

  return (
    <View style={styles.container}>
      {expandedTitle ? <Sheet ref={sheetRef} open title={t('habits.form.title')} onClose={() => setExpandedTitle(null)}>
        <Text style={styles.fullTitle}>{expandedTitle}</Text>
      </Sheet> : null}
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
            const value = entry.dueTime ? displayTime(entry.dueTime) : undefined

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
          onOpenTitle={setExpandedTitle}
                  t={t}
                />
              )
            }

            return (
              <Pressable key={`${selectedDate}:${entry.habitId}`} accessibilityRole="button" accessibilityLabel={entry.title} onPress={() => setExpandedTitle(entry.title)} style={({ pressed }) => [styles.habitDisclosure, pressed ? { backgroundColor: tokens.bgHover } : null]}>
                <ListRow compact title={entry.title} description={value} textMode="personal" trailing={<StatusRing status={outcome.status} size={24} label={outcome.ringLabel} />} chevron={false} readOnly />
              </Pressable>
            )
          })}
        </View>
      ) : null}

      <View style={styles.rowList}>
        {/* eslint-disable-next-line local/max-button-words -- #927 follows the granted calendar drawing. */}
        <ListRow
          compact
          icon="external-link"
          title={t('calendar.goToDay')}
          textMode="label"
          accessibilityLabel={t('calendar.goToDay')}
          chevron={false}
          onClick={onGoToDay}
        />
      </View>
      <CalendarEventsSection
        key={selectedDate}
        calendarEvents={calendarEvents}
        showEventSource={showEventSource}
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


    </View>
  )
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    container: { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost, borderRadius: radius.xl, borderWidth: 1, gap: 24, paddingVertical: 24 },
    copyBlock: { gap: 8, paddingHorizontal: 16 },
    rowList: { gap: 8 },
    habitDisclosure: { minHeight: 68, justifyContent: 'center', borderRadius: 12 },
    dayTitle: { fontFamily: 'Geist_500Medium', fontSize: 20 },
    summaryText: { fontFamily: 'Geist_400Regular', fontSize: 12 },
    emptyDayText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22, paddingVertical: 24, textAlign: 'center' },
    eventSection: { gap: 8, paddingHorizontal: 16 },
    eventTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
    emptyEventText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
    fullTitle: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8, color: tokens.fg1 },
  })
}
