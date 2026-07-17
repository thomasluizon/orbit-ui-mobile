'use client'

import { useTranslations } from 'next-intl'
import { achievementEmoji } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { ProgressBar } from '@/components/ui/progress-bar'

/**
 * The user's next locked achievement plus their overall achievement progress.
 * Renders nothing until gamification is viewable and a locked achievement exists.
 */
export function RailNextAchievement() {
  const t = useTranslations()
  const canViewGamification = useProfile().profile?.canViewGamification ?? false
  const { profile, lockedAchievements } = useGamificationProfile(canViewGamification)

  const next = lockedAchievements[0]
  if (!canViewGamification || !profile || !next || profile.achievementsTotal === 0) return null

  const earned = profile.achievementsEarned
  const total = profile.achievementsTotal
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
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 5 }}>
          <span
            className="truncate"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-1)' }}
          >
            {t(`gamification.achievements.${next.id}.name`)}
          </span>
          <ProgressBar progress={earned / total} label={label} className="h-1!" />
        </div>
        <span className="t-num shrink-0" style={{ fontSize: 13, color: 'var(--fg-3)' }}>
          {earned}/{total}
        </span>
      </div>
    </div>
  )
}
