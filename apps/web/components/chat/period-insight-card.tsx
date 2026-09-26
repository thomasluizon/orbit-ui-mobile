'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { Pager } from '@/components/ui/pager'
import { Button, PillLink } from '@/components/ui/pill-button'

export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const [index, setIndex] = useState(0)
  const pages = getInsightPages(periodInsight)
  const page = pages[Math.min(index, pages.length - 1)] ?? pages[0]
  const points = periodInsight.series ? mapCompletionSeries(periodInsight.series, locale) : []
  const figures = [
    { id: 'completionRate', value: `${periodInsight.completionRate}%` },
    { id: 'daysLogged', value: String(periodInsight.activeDays) },
    { id: 'currentStreak', value: String(periodInsight.currentStreak) },
    { id: 'bestStreak', value: String(periodInsight.bestStreak) },
  ]
  const rows: BlockFrameItem[] = index === 0 ? figures.map((figure) => ({
    id: figure.id,
    label: t(`chat.insight.${figure.id}`),
    control: <span className="text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{figure.value}</span>,
  })) : []
  if (index === 0) {
    periodInsight.topHabits.forEach((habit, habitIndex) => rows.push({
      id: `top-${habitIndex}`,
      wrapLabel: true,
      label: `${t('chat.insight.topHabit')}: ${habit.name}`,
      control: <span className="text-base tabular-nums text-[var(--fg-1)]">{habit.completionRate}%</span>,
    }))
    periodInsight.needsAttention.forEach((habit, habitIndex) => rows.push({
      id: `attention-${habitIndex}`,
      wrapLabel: true,
      label: `${t('chat.insight.needsAttention')}: ${habit.name}`,
      control: <span className="text-base tabular-nums text-[var(--fg-1)]">{habit.completionRate}%</span>,
    }))
  }
  const body = index === 0
    ? points.some((point) => point.scheduled > 0)
      ? <BarChart points={points} label={t('chat.insight.chartLabel')} />
      : undefined
    : <p className="text-pretty text-sm text-[var(--fg-2)] [overflow-wrap:anywhere]">{page.text}</p>

  return (
    <div className="mt-2 w-full md:max-w-[65ch]">
      <BlockFrame
        state="resting"
        title={t('chat.insight.title')}
        count={null}
        items={rows}
        body={<div aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">{t('chat.insight.pageAnnounce', { n: index + 1, total: pages.length, title: t(page.titleKey) })}</span>
          <h4 className="text-sm font-medium text-[var(--fg-1)]">{t(page.titleKey)}</h4>
          {body}
        </div>}
        actions={<div className="flex flex-col gap-3">
          <Pager
            index={index}
            count={pages.length}
            label={t('chat.insight.title')}
            backLabel={t('chat.insight.previous')}
            onBack={index > 0 ? () => setIndex(index - 1) : undefined}
            forwardSlot={<Button variant="ghost" size="sm" disabled={index === pages.length - 1} onClick={() => setIndex(index + 1)}>{t('chat.insight.next')}</Button>}
          />
          { }
          <PillLink variant="ghost" size="sm" href="/progress">{t('chat.insight.progressLink')}</PillLink>
        </div>}
      />
    </div>
  )
}
