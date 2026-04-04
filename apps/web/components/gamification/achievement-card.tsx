'use client'

import { useTranslations, useLocale } from 'next-intl'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { Achievement } from '@orbit/shared/types/gamification'

function rarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'uncommon': return 'text-emerald-400 bg-emerald-400/10'
    case 'rare': return 'text-blue-400 bg-blue-400/10'
    case 'epic': return 'text-purple-400 bg-purple-400/10'
    case 'legendary': return 'text-amber-400 bg-amber-400/10'
    default: return 'text-text-secondary bg-surface-elevated'
  }
}

interface AchievementCardProps {
  achievement: Achievement
  earned: boolean
  earnedDate: string | null
}

export function AchievementCard({ achievement, earned, earnedDate }: AchievementCardProps) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  return (
    <div
      className={`rounded-[var(--radius-lg)] p-4 transition-all duration-150 shadow-[var(--shadow-sm)] ${
        earned
          ? 'bg-surface border border-primary/20 shadow-[var(--shadow-glow-sm)]'
          : 'bg-surface-ground opacity-50 border border-border-muted'
      }`}
    >
      <div className="text-2xl mb-2">
        {earned ? '\u2B50' : '\uD83D\uDD12'}
      </div>

      <p className="text-sm font-bold text-text-primary">
        {t(`gamification.achievements.${achievement.id}.name`)}
      </p>

      <p className="text-[11px] text-text-secondary mt-0.5">
        {t(`gamification.achievements.${achievement.id}.description`)}
      </p>

      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <span
          className={`inline-block px-1.5 py-0.5 rounded-lg text-[9px] font-bold uppercase ${rarityColor(achievement.rarity)}`}
        >
          {t(`gamification.rarity.${achievement.rarity.toLowerCase()}`)}
        </span>
        <span className="text-[10px] font-bold text-primary">
          {t('gamification.xpReward', { n: achievement.xpReward })}
        </span>
      </div>

      {earned && earnedDate && (
        <p className="text-[10px] text-text-muted mt-1">
          {t('gamification.page.earnedOn', { date: format(new Date(earnedDate), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateFnsLocale }) })}
        </p>
      )}
    </div>
  )
}
