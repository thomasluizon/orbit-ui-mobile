'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { useState } from 'react'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslations } from 'next-intl'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { daySummaryLogControl, habitReadStatusKey } from '@orbit/shared/chat/day-summary-core'
import { formatAPIDate, getAccountDay } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { useHabits, useLogHabit } from '@/hooks/use-habits'

const PAGE_SIZE = 3

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  const logHabit = useLogHabit()
  const readScope = useReadActionScope()
  const [today] = useState(() => formatAPIDate(new Date()))
  const occurrenceDate = habitList.date ?? today
  const occurrences = useHabits({
    dateFrom: occurrenceDate,
    dateTo: occurrenceDate,
    includeGeneral: true,
    includeOverdue: true,
  })
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  const visibleItems = habitList.items.slice(0, shownCount)
  const rows = visibleItems.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const snapshotStatusKey = habitReadStatusKey(item.status, item.isBadHabit)
    const control = daySummaryLogControl(occurrence, item.status === 'overdue', readScope ? { ...readScope, date: occurrenceDate, today: getAccountDay(new Date(), readScope.timeZone) } : undefined)
    const logged = control.logged
    const unavailable = logHabit.isPending || control.undoUnavailable || !control.writeAllowed
    return {
      id: item.id,
      label: (
        <button aria-label={t('chat.habitList.open', { name: item.title })} className="flex min-h-[var(--touch-min)] min-w-0 w-full items-center gap-3 rounded-[12px] px-2 py-1 border-0 bg-transparent text-left text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => navigate(habitList.date ? `/habits/${item.id}?date=${habitList.date}` : `/habits/${item.id}`)} type="button">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)]">{item.emoji ?? '•'}</span>
          <PersonalText className="flex-1">{item.title}</PersonalText>
        </button>
      ),
      meta: habitList.read && snapshotStatusKey ? t(snapshotStatusKey) : item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      control: occurrence ? (
        <button disabled={unavailable} aria-label={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} className="grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => {
          if (unavailable || !daySummaryLogControl(occurrence, false, readScope ? { ...readScope, date: occurrenceDate, today: getAccountDay(new Date(), readScope.timeZone) } : undefined).writeAllowed) return
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} type="button">
          <StatusRing status={control.status} size={24} label={t(control.statusKey)} />
        </button>
      ) : undefined,
    }
  })

  return (
    <div className="w-full">
      <BlockFrame state="resting" title={t(habitList.read ? 'nav.habits' : habitList.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title')} count={habitList.items.length === 0 ? null : t('chat.habitList.count', { shown: visibleItems.length, total: habitList.totalCount ?? habitList.items.length })} items={rows} body={habitList.items.length === 0 ? (
        <p className="text-sm text-[var(--fg-3)]">{t(habitList.read || habitList.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty')}</p>
      ) : undefined} actions={visibleItems.length < habitList.items.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShownCount((count) => count + PAGE_SIZE)}>{t('chat.habitList.more')}</Button>
      ) : undefined} />
    </div>
  )
}
