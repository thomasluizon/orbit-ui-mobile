import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { HabitMonthCard as HabitMonthCardData } from '@orbit/shared/types/chat'
import { buildHabitMonthCalendar } from '@orbit/shared/chat/habit-month'
import { buildCalendarMonthModel, formatAPIDate, formatWeekdayLabels } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { CalendarGrid } from '@/app/(tabs)/calendar/_components/calendar-grid'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { BlockFrame } from './read-block-frame'

export function HabitMonthCard({ card }: Readonly<{ card: HabitMonthCardData }>) {
  const { t, i18n } = useTranslation()
  const navigate = useChatNavigation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { months, dayMap, range } = useMemo(() => buildHabitMonthCalendar(card), [card])
  const weekdays = formatWeekdayLabels(i18n.language, card.weekStartDay)
  const weekdayHeaders = weekdays.map((label, index) => ({ key: String(index), label }))
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' })
  const body = <View style={styles.months}>
    {months.map(month => <View key={formatAPIDate(month)} style={styles.month}>
      <Text style={{ color: tokens.fg2, fontSize: 14 }}>{monthFormatter.format(month)}</Text>
      <CalendarGrid compact gridDays={buildCalendarMonthModel(month, dayMap, card.weekStartDay, card.today, range).gridDays}
        weekdayHeaders={weekdayHeaders} selectedDay={null} language={i18n.language} t={t} tokens={tokens} todayKey={card.today}
        onSelectDay={date => navigate({ pathname: '/calendar', params: { date } })} />
    </View>)}
  </View>
  return <BlockFrame state="resting" title={t('chat.habitMonth.title')} items={[]} body={body} />
}

const styles = StyleSheet.create({
  months: { gap: SPACING.s16 },
  month: { gap: SPACING.s8 },
})
