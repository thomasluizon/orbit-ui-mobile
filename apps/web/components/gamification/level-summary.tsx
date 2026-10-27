'use client'

import { useTranslations } from 'next-intl'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { getGamificationLevelTitleKey } from '@orbit/shared/utils'
import { ProgressBar } from '@/components/ui/progress-bar'

export function LevelSummary({ profile, xpProgress }: Readonly<{
  profile: Pick<GamificationProfile, 'level' | 'totalXp' | 'xpForNextLevel'>
  xpProgress: number
}>) {
  const t = useTranslations()
  return <div className="flex w-full flex-col gap-3" data-testid="progress-xp-summary">
    <div className="flex items-baseline gap-3">
      <p className="min-w-0 flex-1 text-[17px] font-medium leading-[22px] text-[var(--fg-1)]">{t('progressScreen.achievements.level', { level: profile.level, title: t(getGamificationLevelTitleKey(profile.level)) })}</p>
      <p className="font-[var(--font-mono)] text-[12px] leading-[17px] tabular-nums text-[var(--fg-3)]">{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</p>
    </div>
    <ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xpProgress')} />
  </div>
}
