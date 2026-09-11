import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { determineHabitDayStatus, parseAPIDate } from '@orbit/shared/utils'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2, radius } from '@/lib/theme'
import { ShowRecurringToggle } from './show-recurring-toggle'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  selectedDate: string
  selectedEntries: CalendarDayEntry[]
  filteredEntries: CalendarDayEntry[]
  completedCount: number
  loggable: boolean
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  onGoToDay: () => void
  displayTime: (time: string) => string
  t: TFunction
  tokens: Tokens
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
  onEntryChange,
  t,
}: Readonly<{
  selectedDate: string
  entry: CalendarDayEntry
  displayTime: (time: string) => string
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  t: TFunction
}>) {
  const sourceChecked = entry.status === 'completed'
  const inFlightRef = useRef(false)
  const [optimisticChecked, setOptimisticChecked] = useState<boolean | null>(null)
  const [isPending, setIsPending] = useState(false)
  const displayedChecked = optimisticChecked === sourceChecked ? null : optimisticChecked
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
    if (inFlightRef.current) return
    inFlightRef.current = true
    setOptimisticChecked(nextChecked)
    setIsPending(true)

    try {
      await onEntryChange(entry, nextChecked)
    } catch {
      setOptimisticChecked(null)
    } finally {
      inFlightRef.current = false
      setIsPending(false)
    }
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
  completedCount,
  loggable,
  showRecurring,
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
            const outcome = getEntryOutcome(entry, t)
            const value = entry.dueTime
              ? `${displayTime(entry.dueTime)} · ${outcome.label}`
              : outcome.label

            if (loggable) {
              return (
                <CalendarDayCheckRow
                  key={entry.habitId}
                  selectedDate={selectedDate}
                  entry={entry}
                  displayTime={displayTime}
                  onEntryChange={onEntryChange}
                  t={t}
                />
              )
            }

            return (
              <ListRow
                key={entry.habitId}
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
  })
}
