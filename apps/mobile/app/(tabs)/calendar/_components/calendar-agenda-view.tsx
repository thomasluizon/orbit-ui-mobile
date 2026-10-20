import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { addDays, eachDayOfInterval } from 'date-fns'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { calendarEntryOutcome, formatAPIDate, formatCalendarAgendaHeading, orderCalendarDayEntries } from '@orbit/shared/utils'
import { ListRow } from '@/components/ui/list-row'
import { StatusRing } from '@/components/ui/status-ring'
import { X } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { CalendarEntryDetails } from './calendar-entry-details'

interface CalendarAgendaViewProps {
  startDate: Date;
  dayMap: ReadonlyMap<string, CalendarDayEntry[]>;
  displayTime: (time: string) => string;
  todayKey: string;
  isLoading: boolean;
  loadingLabel: string;
}

export function CalendarAgendaView({
  startDate,
  dayMap,
  displayTime,
  todayKey,
  isLoading,
  loadingLabel,
}: Readonly<CalendarAgendaViewProps>) {
  const contentFrameStyle = useContentFrameStyle()
  const { t, i18n } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = createTokensV2(currentScheme, currentTheme);
  const [selectedEntry, setSelectedEntry] = useAccountScopedState<CalendarDayEntry | null>(null);
  const dates = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });

  return (
    <View
      testID="calendar-agenda-view"
      accessibilityState={{ busy: isLoading }}
      style={[contentFrameStyle, styles.agendaView]}
    >
      {isLoading ? dates.map((date, index) => (
        <View key={formatAPIDate(date)} testID="calendar-agenda-loading-day">
          {index === 0 ? (
            <Skeleton variant="habit-row" label={loadingLabel} />
          ) : (
            <Skeleton variant="habit-row" grouped />
          )}
        </View>
      )) : dates.map((date) => {
        const entries = orderCalendarDayEntries(dayMap.get(formatAPIDate(date)) ?? []);
        const heading = formatCalendarAgendaHeading(formatAPIDate(date), i18n.language, todayKey, (date) => t('dates.todayWithDate', { date }));

        return (
          <View
            key={formatAPIDate(date)}
            testID="calendar-agenda-day"
            style={styles.agendaDay}
          >
            <Text
              accessibilityRole="header"
              style={[styles.agendaHeading, { color: tokens.fg2 }]}
            >
              {heading}
            </Text>
            {entries.length === 0 ? (
              <Text style={[styles.agendaEmpty, { color: tokens.fg3 }]}>
                {t('calendar.agenda.empty')}
              </Text>
            ) : (
              <View>
                {entries.map((entry) => {
                  const outcome = calendarEntryOutcome(entry);
                  const value = entry.dueTime ? displayTime(entry.dueTime) : t('calendar.timeGrid.noSetTime');
                  return (
                  <ListRow
                    key={entry.habitId}
                    title={entry.title}
                    value={value}
                    wrapValue
                    textMode="personal"
                    chevron={false}
                    trailing={<View importantForAccessibility="no-hide-descendants">
                      <StatusRing status={outcome.status} size={24} label={t(outcome.labelKey)} />
                      {outcome.status === 'bad' ? <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><X size={16} color={tokens.statusBad} strokeWidth={1.5} /></View> : null}
                    </View>}
                    accessibilityLabel={t('calendar.entryLabel', { title: entry.title, time: value, status: t(outcome.labelKey) })}
                    onClick={() => setSelectedEntry(entry)}
                  />
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      {selectedEntry ? <CalendarEntryDetails entries={[selectedEntry]} title={t('calendar.entryDetails')} displayTime={displayTime} onClose={() => setSelectedEntry(null)} /> : null}
    </View>
  );
}


const styles = StyleSheet.create({
  agendaView: { gap: 16 },
  agendaDay: { gap: 4 },
  agendaHeading: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 22 },
  agendaEmpty: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
})
