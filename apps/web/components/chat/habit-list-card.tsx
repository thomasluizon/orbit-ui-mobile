'use client'

import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { HabitBlockRow } from './habit-block-row'
import { useState } from 'react'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslations } from 'next-intl'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { habitListOccurrenceFilters, habitListReadControl, habitListRowState } from '@orbit/shared/chat/habit-list-core'
import { formatAPIDate } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { HabitCheck } from '@/components/habits/habit-check'

import { useHabits, useLogHabit } from '@/hooks/use-habits'

const PAGE_SIZE = 20

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  const logHabit = useLogHabit()
  const readScope = useReadActionScope()
  const [today] = useState(() => formatAPIDate(new Date()))
  const occurrenceDate = habitList.date ?? today
  const occurrences = useHabits(habitListOccurrenceFilters(occurrenceDate))
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  const visibleItems = habitList.items.slice(0, shownCount)
  const rows = visibleItems.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const { control, logged, unavailable } = habitListRowState(item, occurrence, Boolean(habitList.read), occurrenceDate, logHabit.isPending, readScope)
    return <HabitBlockRow key={item.id} title={item.title} emoji={item.emoji}
      label={t('chat.habitList.open', { name: item.title })}
      onOpen={() => navigate(habitList.date ? `/habits/${item.id}?date=${habitList.date}` : `/habits/${item.id}`)}
      control={occurrence ? (
        <button disabled={unavailable} aria-label={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} data-habit-row-control="check" className="grid size-[var(--touch-min)] place-items-center habit-check-target shrink-0 border-0 bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => {
          if (unavailable || !habitListReadControl(occurrence, item.status, occurrenceDate, readScope).writeAllowed) return
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} type="button">
          <HabitCheck status={control.status} label={t(control.statusKey)} />
        </button>
      ) : undefined} />
  })

  return (
    <div className="w-full">
      <BlockFrame state="resting" title={t(habitList.read ? 'nav.habits' : habitList.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title')} count={habitList.items.length === 0 ? null : t('chat.habitList.count', { shown: visibleItems.length, total: habitList.totalCount ?? habitList.items.length })} items={[]} body={habitList.items.length === 0 ? (
        <p className="text-sm text-[var(--fg-3)]">{t(habitList.read || habitList.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty')}</p>
      ) : <div className="flex flex-col gap-2">{rows}</div>} actions={visibleItems.length < habitList.items.length ? (
        <IconButton label={t('chat.habitList.more')} onClick={() => setShownCount((count) => count + PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      ) : undefined} />
    </div>
  )
}
