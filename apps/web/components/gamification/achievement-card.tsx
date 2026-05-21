'use client'

import { useTranslations } from 'next-intl'
import { useDateFormat } from '@/hooks/use-date-format'
import type { Achievement } from '@orbit/shared/types/gamification'

const RARITY_GLYPH: Record<string, string> = {
  common: '◇',
  uncommon: '◈',
  rare: '◆',
  epic: '★',
  legendary: '✦',
}

interface AchievementCardProps {
  achievement: Achievement
  earned: boolean
  earnedDate: string | null
}

export function AchievementCard({ achievement, earned, earnedDate }: Readonly<AchievementCardProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()

  const rarityKey = achievement.rarity.toLowerCase()
  const glyph = RARITY_GLYPH[rarityKey] ?? RARITY_GLYPH.common

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      className="flex items-center"
      style={{
        gap: 12,
        padding: '13px 20px',
        borderBottom: '1px solid var(--hairline)',
        background: earned ? 'transparent' : 'var(--bg-sunk)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: 16,
          color: earned ? 'var(--fg-1)' : 'var(--fg-4)',
          width: 18,
          textAlign: 'center',
        }}
      >
        {glyph}
      </span>
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 15,
            fontWeight: earned ? 600 : 400,
            color: earned ? 'var(--fg-1)' : 'var(--fg-3)',
          }}
        >
          {t(`gamification.achievements.${achievement.id}.name`)}
        </div>
        {earned && (
          <div
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 12,
              fontStyle: 'italic',
              color: 'var(--fg-3)',
              marginTop: 2,
            }}
          >
            {t(`gamification.achievements.${achievement.id}.description`)}
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: 11,
          color: earned ? 'var(--fg-3)' : 'var(--fg-4)',
          fontStyle: earned ? 'normal' : 'italic',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {earned && earnedDate
          ? `${t('gamification.page.earnedOn', { date: displayDate(new Date(earnedDate)) })}`
          : t('gamification.rarityLocked')}
      </span>
    </div>
  )
}
