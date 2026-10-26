import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, RefreshCw } from '@/components/ui/icons'
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { HabitRankingCard as HabitRankingDefinition } from '@orbit/shared/types/chat'
import { formatHabitRankingPeriod } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ListRow } from '@/components/ui/list-row'

import { useHabitRanking } from '@/hooks/use-habit-ranking'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function HabitRankingCard({ habitRanking, isOnline = true }: Readonly<{ habitRanking: HabitRankingDefinition; isOnline?: boolean }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const ranking = useHabitRanking(habitRanking)
  const refreshRef = useRef<View>(null)
  const previousPending = useRef(ranking.pending)
  useEffect(() => {
    if (previousPending.current === 'page' && ranking.pending === null && (!ranking.ranking.nextCursor || ranking.requiresRefresh)) {
      const target = findNodeHandle(refreshRef.current)
      if (target != null) AccessibilityInfo.setAccessibilityFocus(target)
    }
    previousPending.current = ranking.pending
  }, [ranking.pending, ranking.ranking.nextCursor, ranking.requiresRefresh])
  const period = formatHabitRankingPeriod(ranking.ranking.query, i18n.language)
  const number = new Intl.NumberFormat(i18n.language)
  const blocked = ranking.pending !== null || !isOnline
  const status = !isOnline ? 'offline' : ranking.status ?? (!ranking.ranking.isComplete || !ranking.startsAtBeginning ? 'partial' : null)
  if (!ranking.active) return null
  return <BlockFrame state={ranking.status ? 'partiallyFailed' : 'resting'} title={t('chat.ranking.title')} wrapTitle count={null} items={[]}
    body={<View style={{ gap: 12, minWidth: 0 }} accessibilityState={{ busy: ranking.pending !== null }}>
      <View style={{ gap: 4 }}><Text style={{ fontSize: 14, color: tokens.fg2 }}>{t('chat.ranking.from', { date: period.from })}</Text><Text style={{ fontSize: 14, color: tokens.fg2 }}>{t('chat.ranking.through', { date: period.through })}</Text></View>
      {ranking.rows.length === 0 ? <Text style={{ fontSize: 14, color: tokens.fg3 }}>{t('chat.ranking.empty')}</Text> : null}
      {ranking.rows.map(row => <ListRow key={row.habitId} textMode="personal" title={`${number.format(row.rank)}. ${row.emoji ? `${row.emoji} ` : ''}${row.name}`}
        chevron={false} wrapValue value={t('chat.ranking.completions', { count: row.completedCount })}
        accessibilityLabel={t('chat.ranking.open', { rank: number.format(row.rank), name: row.name, count: row.completedCount })}
        onClick={() => { if (!blocked) void ranking.open(row.habitId) }} disabled={blocked} />)}
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, color: tokens.fg2 }}>{status ? t(`chat.ranking.${status}`) : ''}</Text>
    </View>}
    actions={<>
      {ranking.ranking.nextCursor && !ranking.requiresRefresh ? <IconButton label={t('chat.ranking.more')} focusableWhenLoading disabled={!isOnline || ranking.pending === 'open' || ranking.pending === 'refresh'} loading={ranking.pending === 'page'} onClick={() => { if (!blocked) void ranking.showMore() }}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
      <IconButton label={t('chat.ranking.refresh')} buttonRef={refreshRef} focusableWhenLoading disabled={!isOnline || ranking.pending === 'open' || ranking.pending === 'page'} loading={ranking.pending === 'refresh'} onClick={() => { if (!blocked) void ranking.refresh() }}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </>} />
}
