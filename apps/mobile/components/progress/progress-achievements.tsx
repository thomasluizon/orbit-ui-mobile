import type { ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PADDING, SHELL_CONTENT_MAX_WIDTH, SPACING } from '@orbit/shared/theme'
import { visibleProgressAchievements } from '@orbit/shared/utils'
import { AchievementTile } from '@/components/gamification/achievement-tile'
import { LevelSummary } from '@/components/gamification/level-summary'
import { EmptyState } from '@/components/ui/empty-state'
import { PillButton } from '@/components/ui/pill-button'
import type { useGamificationProfile } from '@/hooks/use-gamification'
import type { AppTokensV2 } from '@/lib/theme'
import { LockedCard } from './locked-card'
import { progressStyles } from './progress-styles'

function Section({ children }: Readonly<{ children: ReactNode }>) {
  return <View testID="progress-achievements-section" style={styles.section}>{children}</View>
}

export function AchievementsSection({ gamificationAvailable, profile, xpProgress, tokens }: Readonly<{
  gamificationAvailable: boolean
  profile: ReturnType<typeof useGamificationProfile>['profile']
  xpProgress: number
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { width, fontScale } = useWindowDimensions()
  const contentWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH) - progressStyles.sections.paddingHorizontal * 2
  const columns = Math.max(1, Math.floor((contentWidth + styles.achievementGrid.gap) / (260 * fontScale + styles.achievementGrid.gap)))
  if (!gamificationAvailable) {
    return (
      <Section>
        <View style={progressStyles.windowLock}>
          <LockedCard
            title={t('progressScreen.achievements.lockedTitle')}
            body={t('progressScreen.achievements.lockedBody')}
            action={t('progressScreen.achievements.lockedAction')}
            tokens={tokens}
          />
        </View>
      </Section>
    )
  }
  if (!profile) return null
  const achievements = visibleProgressAchievements(profile.achievements)
  const categories = Array.from(new Set(achievements.map((achievement) => achievement.category)))
  const tileWidth = (contentWidth - styles.achievementGrid.gap * (columns - 1)) / columns
  return (
    <>
      <LevelSummary profile={profile} xpProgress={xpProgress} tokens={tokens} />
      <Section>
        {achievements.length === 0 ? <EmptyState title={t('progressScreen.achievements.empty')} action={<PillButton variant="primary" size="sm" accessibilityRole="link" onClick={() => router.push('/')}>{t('progressScreen.achievements.emptyAction')}</PillButton>} /> : categories.map((category) => <View key={category} style={styles.achievementCategory}><Text accessibilityRole="header" style={[styles.achievementCategoryTitle, { color: tokens.fg2 }]} testID="achievement-category">{t(`gamification.categories.${category}`)}</Text><View style={styles.achievementGrid}>{achievements.filter((achievement) => achievement.category === category).map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} tokens={tokens} width={tileWidth} />)}</View></View>)}
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  achievementCategory: { gap: PADDING.sectionTitleGap },
  achievementCategoryTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20, paddingTop: SPACING.s4 },
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  section: { gap: SPACING.s16 },
})
