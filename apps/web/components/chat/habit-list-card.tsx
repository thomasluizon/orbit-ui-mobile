'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { formatAPIDate } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { useHabits, useLogHabit } from '@/hooks/use-habits'

const PAGE_SIZE = 3

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const t = useTranslations()
  const router = useRouter()
  const logHabit = useLogHabit()
  const [occurrenceDate] = useState(() => formatAPIDate(new Date()))
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
    const logged = occurrence
      ? item.isBadHabit ? occurrence.isLoggedInRange : occurrence.isCompleted
      : false
    return {
      id: item.id,
      label: (
        <button aria-label={t('chat.habitList.open', { name: item.title })} className="flex min-h-11 min-w-0 items-center gap-3 border-0 bg-transparent text-left text-sm text-[var(--fg-1)] hover:text-[var(--fg-2)]" onClick={() => router.push(`/habits/${item.id}`)} type="button">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)]">{item.emoji ?? '•'}</span>
          <span className="truncate">{item.title}</span>
        </button>
      ),
      meta: item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      control: occurrence ? (
        <button aria-label={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} className="grid size-11 place-items-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-hover)]" onClick={() => {
          logHabit.mutate({ habitId: item.id })
        }} type="button">
          <StatusRing status={logged ? 'done' : item.status === 'overdue' ? 'overdue' : 'empty'} size={24} label={t(logged ? 'chat.habitList.logged' : 'chat.habitList.pending')} />
        </button>
      ) : undefined,
    }
  })

  return (
    <div className="mt-2 w-full md:max-w-[65ch]">
      <BlockFrame state="resting" title={t('chat.habitList.title')} count={t('chat.habitList.count', { shown: visibleItems.length, total: habitList.items.length })} items={rows} actions={visibleItems.length < habitList.items.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShownCount((count) => count + PAGE_SIZE)}>{t('chat.habitList.more')}</Button>
      ) : undefined} />
    </div>
  )
}
