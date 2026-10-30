'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitMonthCard as HabitMonthCardData } from '@orbit/shared/types/chat'
import { buildHabitMonthCalendar } from '@orbit/shared/chat/habit-month'
import { formatAPIDate } from '@orbit/shared/utils'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { useDateFormat } from '@/hooks/use-date-format'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { BlockFrame } from './read-block-frame'

export function HabitMonthCard({ card }: Readonly<{ card: HabitMonthCardData }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  const { displayMonthYear } = useDateFormat()
  const { months, dayMap, range } = useMemo(() => buildHabitMonthCalendar(card), [card])
  const body = <div className="flex min-w-0 flex-col gap-4">
    {months.map(month => <div key={formatAPIDate(month)} className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-[var(--fg-2)]">{displayMonthYear(month)}</p>
      <CalendarGrid compact currentMonth={month} dayMap={dayMap} dateRange={range}
        weekStartsOn={card.weekStartDay} todayKey={card.today}
        onSelectDay={date => navigate(`/calendar?date=${date}`)} />
    </div>)}
  </div>
  return <BlockFrame state="resting" title={t('chat.habitMonth.title')} items={[]} body={body} />
}
