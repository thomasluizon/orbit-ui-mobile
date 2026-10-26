'use client'

import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { useState } from 'react'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslations } from 'next-intl'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { habitListOccurrenceFilters, habitListReadControl, habitListRowState } from '@orbit/shared/chat/habit-list-core'
import { formatAPIDate } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { StatusRing } from '@/components/ui/status-ring'

import { useHabits, useLogHabit } from '@/hooks/use-habits'

const PAGE_SIZE = 3

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
    const { control, logged, unavailable, snapshotStatusKey } = habitListRowState(item, occurrence, Boolean(habitList.read), occurrenceDate, logHabit.isPending, readScope)
    return {
      id: item.id,
      label: (
        <button aria-label={t('chat.habitList.open', { name: item.title })} className="flex min-h-[var(--touch-min)] min-w-0 w-full items-center gap-3 rounded-[12px] px-2 py-1 border-0 bg-transparent text-left text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => navigate(habitList.date ? `/habits/${item.id}?date=${habitList.date}` : `/habits/${item.id}`)} type="button">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)]">{item.emoji ?? '•'}</span>
          <PersonalText className="flex-1">{item.title}</PersonalText>
        </button>
      ),
      meta: snapshotStatusKey ? t(snapshotStatusKey) : undefined,
      control: occurrence ? (
        <button disabled={unavailable} aria-label={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} className="grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => {
          if (unavailable || !habitListReadControl(occurrence, item.status, occurrenceDate, readScope).writeAllowed) return
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
        <IconButton label={t('chat.habitList.more')} onClick={() => setShownCount((count) => count + PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      ) : undefined} />
    </div>
  )
}
