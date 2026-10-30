'use client'

import { useTranslations } from 'next-intl'
import type { GamificationCard as GamificationCardData } from '@orbit/shared/types/chat'
import { calculateXpProgress } from '@orbit/shared/utils'
import { gamificationCardTitleKey } from '@orbit/shared/chat/gamification-card-core'
import { AchievementTile } from '@/components/gamification/achievement-tile'
import { GamificationStreak } from '@/components/gamification/gamification-streak'
import { LevelSummary } from '@/components/gamification/level-summary'
import { BlockFrame } from './read-block-frame'

export function GamificationCard({ card }: Readonly<{ card: GamificationCardData }>) {
  const t = useTranslations()
  const { profile, achievements, streak } = card.state
  return <BlockFrame wrapTitle title={t(gamificationCardTitleKey(card))} state="resting" count={null} items={[]}
    body={<div className="flex min-w-0 flex-col gap-3">
      {profile ? <LevelSummary profile={profile} xpProgress={calculateXpProgress(profile)} /> : null}
      {achievements?.achievements.map(achievement => <AchievementTile key={achievement.id} achievement={achievement} />)}
      {achievements?.achievements.length === 0 ? <p className="text-sm text-[var(--fg-2)]">{t('progressScreen.achievements.empty')}</p> : null}
      {streak ? <GamificationStreak streak={streak} read={card.read} showHeading={profile !== null || achievements !== null} /> : null}
    </div>} />
}
