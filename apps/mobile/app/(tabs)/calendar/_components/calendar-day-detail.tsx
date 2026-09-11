import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2, radius } from '@/lib/theme'
import { ShowRecurringToggle } from './show-recurring-toggle'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarDayDetailProps {
  selectedEntries: CalendarDayEntry[]
  filteredEntries: CalendarDayEntry[]
  completedCount: number
  loggable: boolean
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
  onEntryChange: (entry: CalendarDayEntry, checked: boolean) => void
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

export function CalendarDayDetail({
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
      ) : (
        <View style={styles.rows}>
          {filteredEntries.map((entry) => {
            const outcome = getEntryOutcome(entry, t)
            const value = entry.dueTime
              ? `${displayTime(entry.dueTime)} · ${outcome.label}`
              : outcome.label

            if (loggable) {
              return (
                <CheckRow
                  key={entry.habitId}
                  label={entry.title}
                  checked={entry.status === 'completed'}
                  value={value}
                  onChange={(checked) => onEntryChange(entry, checked)}
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
      )}

      <View style={styles.routeRow}>
        <ListRow
          icon="external-link"
          title={t('calendar.goToDay')}
          accessibilityLabel={t('calendar.goToDay')}
          chevron={false}
          onClick={onGoToDay}
        />
      </View>
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
      padding: 16,
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
    rows: {
      marginHorizontal: -16,
    },
    routeRow: {
      marginHorizontal: -16,
    },
  })
}
