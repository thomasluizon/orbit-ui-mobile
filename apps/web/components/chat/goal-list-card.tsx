'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { formatGoalMetricsDate, getGoalMetricsStatusPresentation } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { Badge } from '@/components/ui/badge'

function percentage(item: GoalListCardItem): number {
  return item.target <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

export function GoalListCard({ goalList, onOpenGoal }: Readonly<{ goalList: GoalListCardData; onOpenGoal?: (id: string) => void }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const items = goalList.items.map((item) => {
    const value = percentage(item)
    const progress = t('chat.goalList.progress', { current: item.current, target: item.target, unit: item.unit })
    const deadline = item.deadline ? t('chat.goalList.deadline', { date: formatGoalMetricsDate(item.deadline, locale) }) : null
    const projected = item.projectedCompletionDate ? t('chat.goalList.projected', { date: formatGoalMetricsDate(item.projectedCompletionDate, locale) }) : null
    const tracking = getGoalMetricsStatusPresentation(item.trackingStatus)
    return {
      id: item.id,
      label: tracking ? <div className="flex items-center gap-2"><button type="button" className="min-h-11 min-w-0 flex-1 truncate border-0 bg-transparent text-left text-sm text-[var(--fg-1)] hover:text-[var(--fg-2)]" onClick={() => onOpenGoal?.(item.id)}>{item.title}</button><Badge variant="outline">{t(tracking.labelKey)}</Badge></div> : <button type="button" className="min-h-11 w-full truncate border-0 bg-transparent text-left text-sm text-[var(--fg-1)] hover:text-[var(--fg-2)]" onClick={() => onOpenGoal?.(item.id)}>{item.title}</button>,
      meta: [progress, deadline, projected].filter(Boolean).join(' · '),
      wrapMeta: projected != null,
      control: value === 100
        ? <StatusRing status="done" size={28} label={t('chat.goalList.done', { name: item.title })} />
        : <ProgressRing value={value} size={28} label={t('chat.goalList.ring', { name: item.title })} />,
    }
  })
  return (
    <div className="mt-2 w-full md:max-w-[65ch]">
      <BlockFrame state="resting" title={t('chat.goalList.title')} items={items} actions={(
        <div className="flex flex-col items-start gap-3">
          {items.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.goalList.empty')}</p> : null}
          {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/progress')}>{t('chat.goalList.progressLink')}</Button>
        </div>
      )} />
    </div>
  )
}
