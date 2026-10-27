import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import type { GamificationCard as GamificationCardData } from '@orbit/shared/types/chat'
import { calculateXpProgress } from '@orbit/shared/utils'
import { gamificationCardTitleKey } from '@orbit/shared/chat/gamification-card-core'
import { AchievementTile } from '@/components/gamification/achievement-tile'
import { LevelSummary } from '@/components/gamification/level-summary'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BlockFrame } from './read-block-frame'

export function GamificationCard({ card }: Readonly<{ card: GamificationCardData }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile, achievements } = card.state
  return <BlockFrame wrapTitle title={t(gamificationCardTitleKey(card))} state="resting" count={null} items={[]}
    body={<View style={{ minWidth: 0, gap: 12 }}>
      {profile ? <LevelSummary profile={profile} xpProgress={calculateXpProgress(profile)} tokens={tokens} /> : null}
      {achievements?.achievements.map(achievement => <AchievementTile key={achievement.id} achievement={achievement} tokens={tokens} width="100%" />)}
      {achievements?.achievements.length === 0 ? <Text style={{ color: tokens.fg2, fontSize: 14 }}>{t('progressScreen.achievements.empty')}</Text> : null}
    </View>} />
}
