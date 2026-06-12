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
      <div className="stagger-enter grid grid-cols-2 gap-3 px-5">
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

  const lockedSurface = earned
    ? undefined
    : {
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        opacity: 0.45,
      }

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      className={`flex flex-col items-center text-center ${earned ? 'card-int' : ''}`}
      style={{
        minHeight: 156,
        padding: '18px 12px 14px',
        borderRadius: 16,
        cursor: 'default',
        ...lockedSurface,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 30,
          lineHeight: 1,
          marginBottom: 8,
          filter: earned ? 'none' : 'grayscale(1)',
        }}
      >
        {achievementEmoji(achievement.iconKey)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          color: earned ? 'var(--fg-1)' : 'var(--fg-2)',
          marginBottom: 4,
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          lineHeight: 1.35,
          color: 'var(--fg-3)',
        }}
      >
        {description}
      </span>
    </div>
  )
}
