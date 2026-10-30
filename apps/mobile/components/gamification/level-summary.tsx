import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { getGamificationLevelTitleKey } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { ProgressBar } from '@/components/ui/progress-bar'

export function LevelSummary({ profile, xpProgress, tokens }: Readonly<{
  profile: Pick<GamificationProfile, 'level' | 'totalXp' | 'xpForNextLevel'>
  xpProgress: number
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  return <View style={styles.summary} testID="progress-xp-summary">
    <View style={styles.row}>
      <Text style={[styles.title, { color: tokens.fg1 }]}>{t('progressScreen.achievements.level', { level: profile.level, title: t(getGamificationLevelTitleKey(profile.level)) })}</Text>
      <Text style={[styles.meta, { color: tokens.fg3 }]}>{t('progressScreen.achievements.xp', { current: profile.totalXp, next: profile.xpForNextLevel })}</Text>
    </View>
    <ProgressBar value={xpProgress} max={100} label={t('progressScreen.achievements.xpProgress')} />
  </View>
}

const styles = StyleSheet.create({
  summary: { gap: 12, width: '100%' },
  row: { alignItems: 'baseline', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  title: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 22 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16 },
})
