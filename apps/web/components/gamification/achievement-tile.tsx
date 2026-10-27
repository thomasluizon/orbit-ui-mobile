'use client'

import { useTranslations } from 'next-intl'
import type { Achievement } from '@orbit/shared/types/gamification'
import { AchievementMark } from './achievement-mark'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'

export function AchievementTile({ achievement }: Readonly<{ achievement: Achievement }>) {
  const t = useTranslations()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const hasProgress = current != null && target != null
  const name = t(`gamification.achievements.${achievement.id}.name`)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-[var(--bg-card)] p-record-inset shadow-[inset_0_0_0_1px_var(--hairline-ghost)]" data-achievement-id={achievement.id}>
      <div className="flex flex-wrap items-center gap-3">
        <AchievementMark achievement={achievement} name={name} />
        <div className="flex min-w-0 flex-[1_1_120px] flex-col gap-1">
          <p className={`text-[14px] font-medium leading-[1.4] ${achievement.isEarned ? 'text-[var(--fg-1)]' : 'text-[var(--fg-2)]'}`}>{name}</p>
          <p className="text-pretty text-[12px] leading-[17px] text-[var(--fg-3)]">{t(`gamification.achievements.${achievement.id}.description`)}</p>
        </div>
        {achievement.isEarned ? <div className="shrink-0"><Badge>{t('progressScreen.achievements.earnedLabel')}</Badge></div> : null}
      </div>
      {hasProgress ? (
        <div className="flex flex-col gap-1">
          <ProgressBar value={current} max={target} label={t('progressScreen.achievements.progressLabel', { name, current, target })} />
          <p className="font-[var(--font-mono)] text-[12px] leading-[17px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.achievements.progress', { current, target })}</p>
        </div>
      ) : null}
    </div>
  )
}
