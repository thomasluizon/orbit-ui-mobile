'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { computeDayProgress, formatAPIDate } from '@orbit/shared/utils'
import { EMPTY_HABITS_BY_ID, useHabits } from '@/hooks/use-habits'
import { ProgressOrbit } from './progress-orbit'

/** Today's contextual rail content: the day's completion as the signature orbit. */
export function TodayRail() {
  const t = useTranslations()
  const today = useMemo(() => formatAPIDate(new Date()), [])
  const filters = useMemo(
    () => ({ dateFrom: today, dateTo: today, includeOverdue: true }),
    [today],
  )
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const progress = useMemo(() => computeDayProgress(habitsById, today), [habitsById, today])

  return (
    <div className="flex flex-col items-center" style={{ gap: 16, paddingBlock: 8 }}>
      <ProgressOrbit
        done={progress.done}
        total={progress.total}
        label={t('rail.todayProgress')}
        completeLabel={t('rail.allDone')}
        ariaLabel={t('rail.progressLabel', { done: progress.done, total: progress.total })}
      />
    </div>
  )
}
