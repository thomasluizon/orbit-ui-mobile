'use client'

import { Lock } from 'lucide-react'
import type { Achievement } from '@orbit/shared/types/gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'

type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

const RARITY_GLYPHS: Record<string, string> = {
  common: '◇',
  uncommon: '◈',
  rare: '◆',
  epic: '★',
  legendary: '✦',
}

function rarityGlyph(rarity: string): string {
  return RARITY_GLYPHS[rarity.toLowerCase()] ?? '◇'
}

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
      <div className="px-5">
        <SettingsGroup>
          {category.items.map((achievement) => (
            <AchievementRow
              key={achievement.id}
              achievement={achievement}
              t={t}
            />
          ))}
        </SettingsGroup>
      </div>
    </>
  )
}

interface AchievementRowProps {
  achievement: Achievement
  t: TranslationFn
}

function AchievementRow({ achievement, t }: Readonly<AchievementRowProps>) {
  const earned = achievement.isEarned
  const glyph = rarityGlyph(achievement.rarity)
  const name = t(`gamification.achievements.${achievement.id}.name`)
  const description = t(`gamification.achievements.${achievement.id}.description`)

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      className="flex items-center"
      style={{
        gap: 12,
        padding: '14px 16px',
        minHeight: 56,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          width: 20,
          textAlign: 'center',
          color: earned ? 'var(--fg-1)' : 'var(--fg-4)',
          flexShrink: 0,
        }}
      >
        {glyph}
      </span>
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ gap: 2 }}
      >
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: earned ? 500 : 400,
            color: earned ? 'var(--fg-1)' : 'var(--fg-3)',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--fg-3)',
          }}
        >
          {description}
        </span>
      </div>
      {!earned ? (
        <Lock
          size={14}
          strokeWidth={1.5}
          color="var(--fg-4)"
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
