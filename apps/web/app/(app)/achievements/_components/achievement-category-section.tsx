'use client'

import type { Achievement } from '@orbit/shared/types/gamification'
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
}: AchievementCategorySectionProps) {
  return (
    <div>
      <h2 className="form-label mb-3">
        {t(`gamification.categories.${category.key}` as Parameters<typeof t>[0])} {/* NOSONAR - dynamic i18n key requires assertion */}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {category.items.map((achievement) => (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            earned={achievement.isEarned}
            earnedDate={achievement.earnedAtUtc}
          />
        ))}
      </div>
    </div>
  )
}
