'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'
import { Button } from '@/components/ui/pill-button'
import { ChatLink } from './chat-link'

export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const t = useTranslations()
  const locale = useLocale()
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
  if (expanded) {
    periodInsight.topHabits.forEach((habit, habitIndex) => rows.push({
      id: `top-${habitIndex}`,
      wrapLabel: true,
      label: <PersonalTextDetails outset>{`${t('chat.insight.topHabit')}: ${habit.name}`}</PersonalTextDetails>,
      control: <span className="text-base tabular-nums text-[var(--fg-1)]">{habit.completionRate}%</span>,
    }))
    periodInsight.needsAttention.forEach((habit, habitIndex) => rows.push({
      id: `attention-${habitIndex}`,
      wrapLabel: true,
      label: <PersonalTextDetails outset>{`${t('chat.insight.needsAttention')}: ${habit.name}`}</PersonalTextDetails>,
      control: <span className="text-base tabular-nums text-[var(--fg-1)]">{habit.completionRate}%</span>,
    }))
  }
  const body = <div aria-live="polite" className="flex min-w-0 flex-col gap-3">
    <p className="text-sm text-[var(--fg-3)]">{formatReadWindow({ from: periodInsight.dateFrom, to: periodInsight.dateTo }, locale)}</p>
    {points.some(point => point.scheduled > 0) ? <BarChart points={points} label={t('chat.insight.chartLabel')} /> : null}
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
          <Button variant="ghost" size="sm" expanded={expanded} hasPopup={false} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')}</Button>
          <ChatLink variant="ghost" size="sm" href="/progress">{t('chat.insight.progressLink')}</ChatLink>
        </>}
      />
    </div>
  )
}
