'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PersonalText } from '@/components/ui/personal-text'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { formatGoalMetricsDate, getGoalMetricsStatusPresentation } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useGoals } from '@/hooks/use-goals'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import { Button } from '@/components/ui/pill-button'
import { Badge } from '@/components/ui/badge'

function percentage(item: Pick<GoalListCardItem, 'current' | 'target'>): number {
  return item.target <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

export function GoalListCard({ goalList, onOpenGoal }: Readonly<{ goalList: GoalListCardData; onOpenGoal?: (id: string) => void }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const goals = useGoals()
  const missing = goals.data != null && goalList.items.some((item) => !goals.data.goalsById.has(item.id))
  const frameState = liveBlockState(goals, { stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void goals.refetch() } })
  const items = goalList.items.map((snapshot) => {
    const live = goals.data?.goalsById.get(snapshot.id)
    const item = live ? { ...snapshot, title: live.title, current: live.currentValue, target: live.targetValue, unit: live.unit, deadline: live.deadline, trackingStatus: live.trackingStatus } : snapshot
    const derived = live?.isProgressDerived && live.linkedHabits.length > 0 ? `${t('goals.linkedHabits')}: ${live.linkedHabits.map((habit) => habit.title).join(', ')}` : null
    const value = percentage(item)
    const progress = t('chat.goalList.progress', { current: item.current, target: item.target, unit: item.unit })
    const deadline = item.deadline ? t('chat.goalList.deadline', { date: formatGoalMetricsDate(item.deadline, locale) }) : null
    const projected = item.projectedCompletionDate ? t('chat.goalList.projected', { date: formatGoalMetricsDate(item.projectedCompletionDate, locale) }) : null
    const tracking = getGoalMetricsStatusPresentation(item.trackingStatus)
    return {
      id: item.id,
      wrapLabel: true,
      label: <div className="flex min-w-0 flex-col items-start gap-2">{onOpenGoal ? <button type="button" className="-mx-[8px] min-h-[var(--touch-min)] self-stretch min-w-0 rounded-[12px] border-0 bg-transparent px-2 py-1 text-left text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" aria-label={item.title} onClick={() => onOpenGoal(item.id)}><PersonalText>{item.title}</PersonalText></button> : <PersonalTextDetails outset>{item.title}</PersonalTextDetails>}{tracking ? <Badge variant="outline">{t(tracking.labelKey)}</Badge> : null}<div className="w-full"><ProgressBar value={value} label={t('chat.goalList.ring', { name: item.title })} /></div>{derived ? <PersonalTextDetails outset>{derived}</PersonalTextDetails> : null}</div>,
      meta: [progress, deadline, projected].filter(Boolean).join(' · '),
      wrapMeta: true,

    }
  })
  return (
    <div className="w-full">
      <BlockFrame {...frameState} title={t('chat.goalList.title')} items={items} body={items.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.goalList.empty')}</p> : undefined} actions={(
        <>
          {goals.isError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}
          {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/progress/goals')}>{t('chat.goalList.progressLink')}</Button>
        </>
      )} />
    </div>
  )
}
