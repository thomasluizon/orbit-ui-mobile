'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { visibleProgressAchievements } from '@orbit/shared/utils'
import { AchievementTile } from '@/components/gamification/achievement-tile'
import { LevelSummary } from '@/components/gamification/level-summary'
import { EmptyState } from '@/components/ui/empty-state'
import { PillLink } from '@/components/ui/pill-button'
import type { useGamificationProfile } from '@/hooks/use-gamification'
import { LockedCard } from './locked-card'

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return <section className="flex flex-col gap-4" aria-label={title}>{children}</section>
}

export function AchievementsSection({ gamificationAvailable, profile, xpProgress }: Readonly<{
  gamificationAvailable: boolean
  profile: ReturnType<typeof useGamificationProfile>['profile']
  xpProgress: number
}>) {
  const t = useTranslations()
  if (!gamificationAvailable) {
    return (
      <Section title={t('progressScreen.sections.achievements')}>
        <div className="w-full">
          <LockedCard
            title={t('progressScreen.achievements.lockedTitle')}
            body={t('progressScreen.achievements.lockedBody')}
            action={t('progressScreen.achievements.lockedAction')}
          />
        </div>
      </Section>
    )
  }
  if (!profile) return null
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  return (
    <>
      <LevelSummary profile={profile} xpProgress={xpProgress} />
      <Section title={t('progressScreen.sections.achievements')}>
        {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} action={<PillLink href="/" variant="primary" size="sm">{t('progressScreen.achievements.emptyAction')}</PillLink>} /> : categories.map((category) => <div key={category} className="flex flex-col gap-section-title-gap"><h2 className="pt-1 text-[14px] font-medium leading-5 text-[var(--fg-2)]">{t(`gamification.categories.${category}`)}</h2><div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 lg:gap-4">{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}</div></div>)}
      </Section>
    </>
  )
}
