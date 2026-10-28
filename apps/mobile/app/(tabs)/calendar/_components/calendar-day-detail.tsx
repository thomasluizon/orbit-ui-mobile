import { PersonalText } from '@/components/ui/personal-text'
import { useOpenHabit } from '@/hooks/use-open-habit'
import { useUIStore } from '@/stores/ui-store'
import { Switch } from '@/components/ui/switch'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { Fragment, useMemo } from 'react'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { PADDING, SPACING, WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { getCalendarEntryMutationKey } from '@orbit/shared/hooks'
import {
  type CalendarEventsDisplayState,
} from '@orbit/shared/utils'
import { CheckRow } from '@/components/ui/check-row'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { CalendarDayEvents } from './calendar-day-events'
import { ListRow } from '@/components/ui/list-row'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2, radius } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  loadingLabel?: string
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
  onOpenEvents?: () => void
  onOpenHabit?: (habitId: string) => void
  completedCount: number
  loggable: boolean
  pendingEntryStates: ReadonlyMap<string, boolean>
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onGoToDay: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
}

function CalendarEventsSection({ calendarEvents, showEventSource, state, onRetry, onReconnect, onOpenImport, onOpenEvents, onViewPro, displayTime, t, tokens, styles }: Readonly<{
  calendarEvents: CalendarSyncEvent[]
  showEventSource: boolean
  displayTime: (time: string) => string
  state: CalendarEventsDisplayState
  onRetry: () => void
  onReconnect: () => void
  onOpenImport: (eventId: string | null) => void
  onViewPro: () => void
  onOpenEvents?: () => void
  t: TFunction
  tokens: Tokens
  styles: ReturnType<typeof createStyles>
}>) {
  const { width } = useWindowDimensions()
  if (state === 'pro-boundary') return <CapacityNotice
    message={t('calendar.proBoundary.title')}
    body={t('calendar.proBoundary.body')}
    // eslint-disable-next-line local/max-button-words -- #1341 requires the granted calendar boundary action.
    action={<View style={{ alignItems: 'flex-start' }}><PillButton size="sm" variant={width >= WIDE_DESKTOP_BREAKPOINT ? 'secondary' : 'primary'} onClick={onViewPro}>{t('calendar.proBoundary.action')}</PillButton></View>}
  />
  if (state === 'not-connected') return <View style={styles.eventSection}>
    <ListRow textMode="label" title={t('calendar.calendars.title')} onClick={onReconnect} />
  </View>
  return <View style={styles.eventSection}>
    <Text style={[styles.eventTitle, { color: tokens.fg2 }]}>{t('calendar.dayDetail.eventsTitle')}</Text>
    {state === 'loading' ? <View>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.emptyEventText, { opacity: 0 }]}>{t('calendar.dayDetail.noEventsToImport')}</Text>
      <View style={StyleSheet.absoluteFill}><Skeleton variant="fill" label={t('calendar.fetchingEvents')} /></View>
    </View> : null}
    {state === 'failed' ? <View style={styles.eventSection}><Text accessibilityLabel={t('calendar.fetchError')} accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.eventErrorText, { color: tokens.fg1 }]}>{t('calendar.fetchError')}</Text><ListRow textMode="label" title={t('common.retry')} onClick={onRetry} /></View> : null}
    {state === 'ready' && calendarEvents.length === 0 ? <Text style={[styles.emptyEventText, { color: tokens.fg3 }]}>{t('calendar.dayDetail.noEventsToImport')}</Text> : null}
    {state === 'ready' && calendarEvents.length > 0 ? <CalendarDayEvents t={t} displayTime={displayTime} calendarEvents={calendarEvents} showEventSource={showEventSource} onOpenImport={onOpenImport} onOpenEvents={onOpenEvents} /> : null}
  </View>
}

type EntryOutcome = {
  ringLabel: string
  status: NonNullable<StatusRingProps['status']>
}

function getEntryOutcome(entry: CalendarDayEntry, t: TFunction): EntryOutcome {
  const completed = entry.status === 'completed'

  if (entry.isBadHabit) {
    const label = t(completed ? 'calendar.status.indulged' : 'calendar.status.resisted')
    return {
      ringLabel: entry.status === 'upcoming' ? t('calendar.status.missed') : label,
      status: completed ? 'bad' : entry.status === 'upcoming' ? 'empty' : 'done',
    }
  }

  const label = t(completed ? 'calendar.status.completed' : 'calendar.status.missed')
  return {
    ringLabel: label,
    status: completed ? 'done' : 'empty',
  }
}

function CalendarDayCheckRow({
  disabled,
  entry,
  value,
  isPending,
  pendingChecked,
  onEntryChange,
  onOpenHabit,
  tokens,
}: Readonly<{
  tokens: Tokens
  disabled?: boolean
  entry: CalendarDayEntry
  value: string
  isPending: boolean
  pendingChecked: boolean | undefined
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<unknown> | null
  onOpenHabit: (habitId: string) => void
}>) {
  const sourceChecked = entry.status === 'completed'
  const displayedChecked = pendingChecked === undefined || pendingChecked === sourceChecked
    ? null
    : pendingChecked
  const checked = displayedChecked ?? sourceChecked

  async function changeChecked(nextChecked: boolean) {
    const entryChange = onEntryChange(entry, nextChecked)
    if (!entryChange) return
    await entryChange.catch(() => undefined)
  }

  return (
    <CheckRow
      disabled={disabled}
      leading={<HabitRowLeading habitTitle={entry.title} emoji={entry.emoji} emojiSize={22} wellSize={46} wellRadius={12} monogramColor={tokens.fg3} tokens={tokens} />}
      label={entry.title}
      textMode="personal"
      variant="calendar-day"
      onOpenLabel={() => onOpenHabit(entry.habitId)}
      checked={checked}
      value={value}
      loading={isPending}
      onChange={(nextChecked) => void changeChecked(nextChecked)}
    />
  )
}

export function CalendarDayDetail({
  loadingLabel,
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
  onOpenEvents,
  onOpenHabit,
  completedCount,
  loggable,
  pendingEntryStates,
  onEntryChange,
  onGoToDay,
  displayTime,
  t,
  tokens,
}: Readonly<CalendarDayDetailProps>) {
  const openHabit = useOpenHabit()
  const setShowRecurring = useUIStore(state => state.setCalendarShowRecurring)
  const showRecurring = useUIStore(state => state.calendarShowRecurring)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const summary = filteredEntries.length > 0
    ? t('calendar.dayDetail.completionSummary', {
        done: completedCount,
        total: filteredEntries.length,
      })
    : t('calendar.dayDetail.nothingDue')

  return (
    <View style={styles.container} accessibilityState={loadingLabel ? { busy: true } : undefined}>
      <View style={styles.copyBlock}>
        {showTitle ? <Text style={[styles.dayTitle, { color: tokens.fg1 }]}>{title}</Text> : null}
        <Text accessibilityElementsHidden={Boolean(loadingLabel)} importantForAccessibility={loadingLabel ? "no-hide-descendants" : "auto"} style={[styles.summaryText, { color: tokens.fg3, opacity: loadingLabel ? 0 : 1 }]}>{summary}</Text>

      </View>
      <Switch label={t('calendar.showRecurringShort')} checked={showRecurring} onChange={setShowRecurring} />
      {!loadingLabel && filteredEntries.length === 0 ? (
        <Text style={[styles.emptyDayText, { color: tokens.fg3 }]}>{t('calendar.noHabitsScheduled')}</Text>
      ) : null}

      {loadingLabel || filteredEntries.length > 0 ? (
        <View testID={loadingLabel ? 'calendar-day-skeleton' : undefined} style={styles.rowList}>
          {loadingLabel && filteredEntries.length === 0 ? <View>
            <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.emptyDayText, { opacity: 0 }]}>{t('calendar.noHabitsScheduled')}</Text>
            <View style={StyleSheet.absoluteFill}><Skeleton variant="fill" label={loadingLabel} /></View>
          </View> : null}
          {filteredEntries.map((entry) => {
            const entryKey = getCalendarEntryMutationKey(selectedDate, entry.habitId)
            const outcome = getEntryOutcome(entry, t)
            const value = entry.dueTime ? displayTime(entry.dueTime) : t('calendar.timeGrid.noSetTime')

            const row = loggable ? (
                <CalendarDayCheckRow
                  disabled={Boolean(loadingLabel)}
                  tokens={tokens}
                  entry={entry}
                  value={value}
                  isPending={pendingEntryStates.has(entryKey)}
                  pendingChecked={pendingEntryStates.get(entryKey)}
                  onEntryChange={onEntryChange}
                  onOpenHabit={onOpenHabit ?? ((id) => openHabit(id, selectedDate))}
                />
              ) : (
              <Pressable disabled={Boolean(loadingLabel)} focusable={!loadingLabel} focusOffset={-6} accessibilityRole="button" accessibilityLabel={`${entry.title}, ${outcome.ringLabel}`} onPress={() => (onOpenHabit ?? ((id) => openHabit(id, selectedDate)))(entry.habitId)} style={styles.habitDisclosure}>
                {({ pressed, focused }) => <>
                <View pointerEvents="none" accessible={false} style={[styles.habitFill, { backgroundColor: pressed || focused ? tokens.bgHover : 'transparent' }]} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s12 }}>
                  <HabitRowLeading habitTitle={entry.title} emoji={entry.emoji} emojiSize={22} wellSize={46} wellRadius={12} monogramColor={tokens.fg3} tokens={tokens} />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <PersonalText style={{ fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4, color: tokens.fg1 }}>{entry.title}</PersonalText>
                    <Text style={{ fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, color: tokens.fg2 }}>{value}</Text>
                  </View>
                  <StatusRing status={outcome.status} size={24} label={outcome.ringLabel} />
                </View>
                </>}
              </Pressable>
            )
            return loadingLabel ? <View key={`${selectedDate}:${entry.habitId}`}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ opacity: 0 }}>{row}</View>
              <View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}><Skeleton variant="settings" rows={1} label={loadingLabel} /></View>
            </View> : <Fragment key={`${selectedDate}:${entry.habitId}`}>{row}</Fragment>
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
        onOpenEvents={onOpenEvents}
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
    container: { backgroundColor: tokens.bgCard, outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid', outlineColor: tokens.hairlineGhost, borderRadius: radius.xl, gap: 16, paddingHorizontal: PADDING.cardInset, paddingVertical: PADDING.cardInset },
    copyBlock: { gap: 4 },
    rowList: { gap: 0 },
    habitDisclosure: { minHeight: 68, justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
    habitFill: { position: 'absolute', top: SPACING.s4, bottom: SPACING.s4, left: SPACING.s4, right: SPACING.s4, borderRadius: 12 },
    dayTitle: { fontFamily: 'Geist_500Medium', fontSize: 20 },
    summaryText: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    emptyDayText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
    eventSection: { gap: 8 },
    eventErrorText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
    eventTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 },
    emptyEventText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
  })
}
