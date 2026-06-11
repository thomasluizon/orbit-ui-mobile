'use client'

import type { Achievement } from '@orbit/shared/types/gamification'
import { achievementEmoji } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'

type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: TranslationFn
}

export function AchievementCategorySection({
  category,
  t,
}: Readonly<AchievementCategorySectionProps>) {
  return (
    <>
      <SectionLabel>
        {t(`gamification.categories.${category.key}`)}
      </SectionLabel>
      <div className="grid grid-cols-3 gap-3 px-5">
        {category.items.map((achievement) => (
          <AchievementTile
            key={achievement.id}
            achievement={achievement}
            t={t}
          />
        ))}
      </div>
    </>
  )
}

interface AchievementTileProps {
  achievement: Achievement
  t: TranslationFn
}

function AchievementTile({ achievement, t }: Readonly<AchievementTileProps>) {
  const earned = achievement.isEarned
  const name = t(`gamification.achievements.${achievement.id}.name`)
  const description = t(`gamification.achievements.${achievement.id}.description`)

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      title={description}
      className="flex flex-col items-center rounded-[18px] text-center"
      style={{
        padding: '18px 8px 14px',
        background: earned ? 'var(--bg-field)' : 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 28,
          lineHeight: 1,
          marginBottom: 8,
          opacity: earned ? 1 : 0.5,
          filter: earned ? 'none' : 'grayscale(1)',
        }}
      >
        {achievementEmoji(achievement.iconKey)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.25,
          color: earned ? 'var(--fg-1)' : 'var(--fg-4)',
        }}
      >
        {name}
      </span>
      <span className="sr-only">{description}</span>
    </div>
  )
}
