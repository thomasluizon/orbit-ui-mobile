'use client'

import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { useLocale, useTranslations } from 'next-intl'
import type { HabitRankingCard as HabitRankingDefinition } from '@orbit/shared/types/chat'
import { formatHabitRankingPeriod } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { HabitBlockRow } from './habit-block-row'

import { useHabitRanking } from '@/hooks/use-habit-ranking'

export function HabitRankingCard({ habitRanking, isOnline = true }: Readonly<{ habitRanking: HabitRankingDefinition; isOnline?: boolean }>) {
  const t = useTranslations('chat.ranking')
  const locale = useLocale()
  const ranking = useHabitRanking(habitRanking)
  const period = formatHabitRankingPeriod(ranking.ranking.query, locale)
  const number = new Intl.NumberFormat(locale)
  const blocked = ranking.pending !== null || !isOnline
  const status = !isOnline ? 'offline' : ranking.status ?? (!ranking.ranking.isComplete || !ranking.startsAtBeginning ? 'partial' : null)
  if (!ranking.active) return null
  return <BlockFrame state={ranking.status ? 'partiallyFailed' : 'resting'} title={t('title')} wrapTitle count={null} items={[]}
    body={<div className="flex min-w-0 flex-col gap-3" aria-busy={ranking.pending !== null}>
      <div className="flex flex-col gap-1 text-sm text-[var(--fg-2)]"><p>{t('from', { date: period.from })}</p><p>{t('through', { date: period.through })}</p></div>
      {ranking.rows.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('empty')}</p> : null}
      {ranking.rows.map(row => <HabitBlockRow key={row.habitId} title={row.name} emoji={row.emoji}
        meta={t('completions', { count: row.completedCount })}
        label={t('open', { rank: number.format(row.rank), name: row.name, count: row.completedCount })}
        onOpen={() => { if (!blocked) void ranking.open(row.habitId) }} disabled={blocked} />)}
      <p role="status" className="text-sm text-[var(--fg-2)]">{status ? t(status) : ''}</p>
    </div>}
    actions={<>
      {ranking.ranking.nextCursor && !ranking.requiresRefresh ? <IconButton label={t('more')} focusableWhenLoading disabled={!isOnline || ranking.pending === 'open' || ranking.pending === 'refresh'} loading={ranking.pending === 'page'} onClick={() => { if (!blocked) void ranking.showMore() }}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
    </>} />
}
