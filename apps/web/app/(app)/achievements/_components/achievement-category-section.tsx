'use client'

import type { Achievement } from '@orbit/shared/types/gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { AchievementCard } from '@/components/gamification/achievement-card'

type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: (key: string) => string
}

export function AchievementCategorySection({
  category,
  t,
}: Readonly<AchievementCategorySectionProps>) {
  return (
    <div>
      <SectionLabel>
        {t(`gamification.categories.${category.key}` as Parameters<typeof t>[0])}{/* NOSONAR */}
      </SectionLabel>
      {category.items.map((achievement) => (
        <AchievementCard
          key={achievement.id}
          achievement={achievement}
          earned={achievement.isEarned}
          earnedDate={achievement.earnedAtUtc}
        />
      ))}
    </div>
  )
}
