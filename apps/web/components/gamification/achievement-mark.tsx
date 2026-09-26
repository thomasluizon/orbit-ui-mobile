import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { achievementGlyphKey } from '@orbit/shared/utils'
import { Calendar, Flame, Satellite, Shield, Star, Sun, Target, Trophy, Zap, type IconProps } from '@/components/ui/icons'

const GLYPHS: Record<ReturnType<typeof achievementGlyphKey>, ComponentType<IconProps>> = {
  calendar: Calendar, flame: Flame, satellite: Satellite, shield: Shield, star: Star,
  sun: Sun, target: Target, trophy: Trophy, zap: Zap,
}

export function AchievementMark({ achievement, name }: Readonly<{ achievement: { iconKey: string; isEarned: boolean }; name: string }>) {
  const t = useTranslations()
  const Glyph = GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return <span role="img"
    aria-label={t(achievement.isEarned ? 'progressScreen.achievements.earnedState' : 'progressScreen.achievements.unearnedState', { name })}
    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
    data-state={achievement.isEarned ? 'earned' : 'unearned'}
    style={achievement.isEarned ? { background: 'var(--status-done)' } : { boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}>
    <Glyph size={20} strokeWidth={2} color={achievement.isEarned ? 'var(--bg)' : 'var(--fg-3)'} />
  </span>
}
