'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import type { HabitRankingCard as HabitRankingDefinition } from '@orbit/shared/types/chat'
import { formatHabitRankingPeriod } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ListRow } from '@/components/ui/list-row'
import { Button } from '@/components/ui/pill-button'
import { useHabitRanking } from '@/hooks/use-habit-ranking'

export function HabitRankingCard({ habitRanking, isOnline = true }: Readonly<{ habitRanking: HabitRankingDefinition; isOnline?: boolean }>) {
  const t = useTranslations('chat.ranking')
  const locale = useLocale()
  const ranking = useHabitRanking(habitRanking)
  const refreshRef = useRef<HTMLButtonElement>(null)
  const moreFocused = useRef(false)
  const previousPending = useRef(ranking.pending)
  useEffect(() => {
    if (previousPending.current === 'page' && ranking.pending === null && !ranking.ranking.nextCursor && moreFocused.current) refreshRef.current?.focus({ preventScroll: true })
    previousPending.current = ranking.pending
  }, [ranking.pending, ranking.ranking.nextCursor])
  const period = formatHabitRankingPeriod(ranking.ranking.query, locale)
  const number = new Intl.NumberFormat(locale)
  const blocked = ranking.pending !== null || !isOnline
  const status = !isOnline ? 'offline' : ranking.status ?? (!ranking.ranking.isComplete || !ranking.startsAtBeginning ? 'partial' : null)
  if (!ranking.active) return null
  return <BlockFrame state={ranking.status ? 'partiallyFailed' : 'resting'} title={t('title')} wrapTitle count={null} items={[]}
    body={<div className="flex min-w-0 flex-col gap-3" aria-busy={ranking.pending !== null}>
      <div className="flex flex-col gap-1 text-sm text-[var(--fg-2)]"><p>{t('from', { date: period.from })}</p><p>{t('through', { date: period.through })}</p></div>
      {ranking.rows.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('empty')}</p> : null}
      {ranking.rows.map(row => <ListRow key={row.habitId} textMode="personal" title={`${number.format(row.rank)}. ${row.emoji ? `${row.emoji} ` : ''}${row.name}`}
        chevron={false} wrapValue value={t('completions', { count: row.completedCount })}
        accessibilityLabel={t('open', { rank: number.format(row.rank), name: row.name, count: row.completedCount })}
        onClick={() => { if (!blocked) void ranking.open(row.habitId) }} disabled={blocked} />)}
      <p role="status" className="text-sm text-[var(--fg-2)]">{status ? t(status) : ''}</p>
    </div>}
    actions={<>
      {ranking.ranking.nextCursor && ranking.status !== 'stale' && ranking.status !== 'removed' ? <Button variant="ghost" size="sm" focusableWhenLoading onFocus={() => { moreFocused.current = true }} onBlur={() => { moreFocused.current = false }} disabled={!isOnline || ranking.pending === 'open' || ranking.pending === 'refresh'} loading={ranking.pending === 'page'} onClick={() => { if (!blocked) void ranking.showMore() }}>{t('more')}</Button> : null}
      <Button variant="ghost" size="sm" buttonRef={refreshRef} focusableWhenLoading disabled={!isOnline || ranking.pending === 'open' || ranking.pending === 'page'} loading={ranking.pending === 'refresh'} onClick={() => { if (!blocked) void ranking.refresh() }}>{t('refresh')}</Button>
    </>} />
}
