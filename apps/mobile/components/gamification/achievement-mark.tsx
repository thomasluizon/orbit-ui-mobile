import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { achievementGlyphKey } from '@orbit/shared/utils'
import { Calendar, Flame, Satellite, Shield, Star, Sun, Target, Trophy, Zap, type IconProps } from '@/components/ui/icons'
import type { AppTokensV2 } from '@/lib/theme'

const GLYPHS: Record<ReturnType<typeof achievementGlyphKey>, ComponentType<IconProps>> = {
  calendar: Calendar, flame: Flame, satellite: Satellite, shield: Shield, star: Star,
  sun: Sun, target: Target, trophy: Trophy, zap: Zap,
}

export function AchievementMark({ achievement, name, tokens }: Readonly<{ achievement: { iconKey: string; isEarned: boolean }; name: string; tokens: AppTokensV2 }>) {
  const { t } = useTranslation()
  const Glyph = GLYPHS[achievementGlyphKey(achievement.iconKey)]
  return <View accessibilityRole="image"
    accessibilityLabel={t(achievement.isEarned ? 'progressScreen.achievements.earnedState' : 'progressScreen.achievements.unearnedState', { name })}
    style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...(achievement.isEarned ? { backgroundColor: tokens.statusDone } : { borderColor: tokens.hairlineStrong, borderWidth: 1.5 }) }}
    testID={`achievement-mark-${achievement.isEarned ? 'earned' : 'unearned'}`}>
    <Glyph size={20} strokeWidth={2} color={achievement.isEarned ? tokens.bg : tokens.fg3} />
  </View>
}
