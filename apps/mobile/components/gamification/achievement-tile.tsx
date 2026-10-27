import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, type DimensionValue } from 'react-native'
import type { Achievement } from '@orbit/shared/types/gamification'
import { PADDING } from '@orbit/shared/theme'
import type { AppTokensV2 } from '@/lib/theme'
import { AchievementMark } from './achievement-mark'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'

export function AchievementTile({ achievement, tokens, width }: Readonly<{ achievement: Achievement; tokens: AppTokensV2; width: DimensionValue }>) {
  const { t } = useTranslation()
  const current = achievement.progressCurrent
  const target = achievement.progressTarget
  const hasProgress = current != null && target != null
  const name = t(`gamification.achievements.${achievement.id}.name`)
  return (
    <View style={[styles.achievement, { width, backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]} testID={`achievement-tile-${achievement.id}`}>
      <View style={styles.achievementHeader}>
        <AchievementMark achievement={achievement} name={name} tokens={tokens} />
        <View style={styles.achievementCopy}>
          <Text style={[styles.achievementName, { color: achievement.isEarned ? tokens.fg1 : tokens.fg2 }]}>{name}</Text>
          <Text style={[styles.achievementBody, { color: tokens.fg3 }]}>{t(`gamification.achievements.${achievement.id}.description`)}</Text>
        </View>
        {achievement.isEarned ? <View style={styles.earnedBadge}><Badge>{t('progressScreen.achievements.earnedLabel')}</Badge></View> : null}
      </View>
      {hasProgress ? <View style={styles.achievementProgress}><ProgressBar value={current} max={target} label={t('progressScreen.achievements.progressLabel', { name, current, target })} /><Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.achievements.progress', { current, target })}</Text></View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  earnedBadge: { flexShrink: 0 },
  achievement: { borderRadius: 20, borderWidth: 1, gap: 12, minWidth: 0, padding: PADDING.recordInset },
  achievementHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, achievementCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 120, gap: 4, minWidth: 0 },
  achievementName: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20 }, achievementBody: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 17 }, achievementProgress: { gap: 4 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
})
