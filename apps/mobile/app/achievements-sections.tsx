import { View, Text, StyleSheet } from 'react-native'
import type { Achievement } from '@orbit/shared/types/gamification'
import { AchievementCard } from '@/components/gamification/achievement-card'
import { createColors } from '@/lib/theme'

type AppColors = ReturnType<typeof createColors>

type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: (key: string) => string
  styles: ReturnType<typeof createAchievementsScreenStyles>
}

export function AchievementCategorySection({
  category,
  t,
  styles,
}: AchievementCategorySectionProps) {
  return (
    <View style={styles.categorySection}>
      <Text style={styles.categoryLabel}>
        {t(`gamification.categories.${category.key}`).toUpperCase()}
      </Text>
      <View style={styles.achievementGrid}>
        {category.items.map((achievement) => (
          <View key={achievement.id} style={styles.achievementItem}>
            <AchievementCard
              achievement={achievement}
              earned={achievement.isEarned}
              earnedDate={achievement.earnedAtUtc}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

export function createAchievementsScreenStyles(colors: AppColors) {
  return StyleSheet.create({
    categorySection: {
      marginTop: 24,
      gap: 12,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    achievementGrid: {
      flexDirection: 'column',
      gap: 12,
    },
    achievementItem: {
      width: '100%',
    },
  })
}
