'use client'

import { useTranslations } from 'next-intl'
import { achievementEmoji } from '@orbit/shared/utils'
import type { Achievement } from '@orbit/shared/types/gamification'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { ProgressBar } from '@/components/ui/progress-bar'

type AchievementWithProgress = Achievement & {
  progressCurrent: number
  progressTarget: number
}

function hasQuantifiableProgress(
  achievement: Achievement,
): achievement is AchievementWithProgress {
  return (
    typeof achievement.progressCurrent === 'number' &&
    typeof achievement.progressTarget === 'number' &&
    achievement.progressTarget > 0
  )
}

/**
 * The locked achievement closest to unlocking, with its own progress toward its threshold. When no
 * locked achievement exposes quantifiable progress (all remaining ones are one-shot), it falls back to
 * the first locked achievement shown with its description and no progress bar. Renders nothing until
 * gamification is viewable and a locked achievement exists.
 */
export function RailNextAchievement() {
  const t = useTranslations()
  const canViewGamification = useProfile().profile?.canViewGamification ?? false
  const { profile, lockedAchievements } = useGamificationProfile(canViewGamification)

  const closest = lockedAchievements
    .filter(hasQuantifiableProgress)
    .reduce<AchievementWithProgress | null>((best, achievement) => {
      if (!best) return achievement
      const ratio = achievement.progressCurrent / achievement.progressTarget
      const bestRatio = best.progressCurrent / best.progressTarget
      return ratio > bestRatio ? achievement : best
    }, null)

  const next = closest ?? lockedAchievements[0]
  if (!canViewGamification || !profile || !next) return null

  const label = t('rail.nextAchievement')

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)' }}>
        {label}
      </span>
      <div className="flex items-center" style={{ gap: 12 }}>
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center rounded-[12px]"
          style={{ width: 36, height: 36, fontSize: 20, background: 'var(--bg-well)' }}
        >
          {achievementEmoji(next.iconKey)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
          <span
            className="truncate"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-1)' }}
          >
            {t(`gamification.achievements.${next.id}.name`)}
          </span>
          {closest ? (
            <ProgressBar
              progress={closest.progressCurrent / closest.progressTarget}
              label={label}
              className="h-1!"
            />
          ) : (
            <span
              className="truncate"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}
            >
              {t(`gamification.achievements.${next.id}.description`)}
            </span>
          )}
        </div>
        {closest ? (
          <span className="t-num shrink-0" style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            {closest.progressCurrent}/{closest.progressTarget}
          </span>
        ) : null}
      </div>
    </div>
  )
}
