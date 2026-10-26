'use client'

import { HabitBlockRow } from './habit-block-row'
import { useChatNavigation } from '@/hooks/use-chat-navigation'

import { ChevronsUp, ChevronDown } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'


export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const navigate = useChatNavigation()
  const [expanded, setExpanded] = useState(false)
  const pages = getInsightPages(periodInsight)
  const points = periodInsight.series ? mapCompletionSeries(periodInsight.series, locale) : []
  const figures = [
    { id: 'completionRate', value: `${periodInsight.completionRate}%` },
    { id: 'daysLogged', value: String(periodInsight.activeDays) },
    ...(expanded ? [
      { id: 'currentStreak', value: String(periodInsight.currentStreak) },
      { id: 'bestStreak', value: String(periodInsight.bestStreak) },
    ] : []),
  ]
  const rows: BlockFrameItem[] = figures.map((figure) => ({
    id: figure.id,
    label: t(`chat.insight.${figure.id}`),
    control: <span className="text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{figure.value}</span>,
  }))
  const habitRows = expanded ? [
    { id: 'top', label: t('chat.insight.topHabit'), habits: periodInsight.topHabits },
    { id: 'attention', label: t('chat.insight.needsAttention'), habits: periodInsight.needsAttention },
  ].flatMap(group => group.habits.map((habit, index) => <HabitBlockRow key={`${group.id}-${index}`} title={habit.name} emoji={habit.emoji}
    meta={group.label} label={`${group.label}: ${habit.name}`} onOpen={habit.habitId ? () => navigate(`/habits/${habit.habitId}`) : undefined}
    control={<span className="text-base tabular-nums text-[var(--fg-1)]">{habit.completionRate}%</span>} />)) : []

  const body = <div aria-live="polite" className="flex min-w-0 flex-col gap-3">
    <p className="text-sm text-[var(--fg-3)]">{formatReadWindow({ from: periodInsight.dateFrom, to: periodInsight.dateTo }, locale)}</p>
    {points.some(point => point.scheduled > 0) ? <BarChart points={points} label={t('chat.insight.chartLabel')} /> : null}
    {habitRows}
    {expanded ? pages.slice(1).map(page => <div key={page.titleKey} className="flex flex-col gap-2"><h4 className="text-sm font-medium text-[var(--fg-1)]">{t(page.titleKey)}</h4><p className="text-sm text-[var(--fg-2)] [overflow-wrap:anywhere]">{page.text}</p></div>) : null}
  </div>

  return (
    <div className="w-full">
      <BlockFrame
        state="resting"
        title={t('chat.insight.title')}
        count={null}
        items={rows}
        body={body}
        actions={<>
          <IconButton label={t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')} expanded={expanded} hasPopup={false} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronsUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}</IconButton>
        </>}
      />
    </div>
  )
}
