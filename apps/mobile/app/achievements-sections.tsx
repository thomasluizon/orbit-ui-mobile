import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import type { Achievement } from '@orbit/shared/types/gamification'
import { achievementEmoji } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'

type Tokens = ReturnType<typeof createTokensV2>
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

const GRID_PADDING = 20
const GRID_GAP = 12
const GRID_COLUMNS = 2

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: TranslationFn
  tokens: Tokens
}

export function AchievementCategorySection({
  category,
  t,
  tokens,
}: Readonly<AchievementCategorySectionProps>) {
  const { width } = useWindowDimensions()
  const tileWidth =
    (width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS

  return (
    <>
      <SectionLabel>{t(`gamification.categories.${category.key}`)}</SectionLabel>
      <View style={styles.grid}>
        {category.items.map((achievement, index) => (
          <Animated.View
            key={achievement.id}
            entering={
              index < 8
                ? FadeInDown.duration(280)
                    .delay(index * 40)
                    .reduceMotion(ReduceMotion.System)
                : undefined
            }
          >
            <AchievementTile
              achievement={achievement}
              t={t}
              tokens={tokens}
              width={tileWidth}
            />
          </Animated.View>
        ))}
      </View>
    </>
  )
}

interface AchievementTileProps {
  achievement: Achievement
  t: TranslationFn
  tokens: Tokens
  width: number
}

function AchievementTile({
  achievement,
  t,
  tokens,
  width,
}: Readonly<AchievementTileProps>) {
  const earned = achievement.isEarned
  const name = t(`gamification.achievements.${achievement.id}.name`)
  const description = t(`gamification.achievements.${achievement.id}.description`)

  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${description}`}
      testID={`achievement-${achievement.id}`}
      style={[
        styles.tile,
        !earned && styles.tileLocked,
        {
          width,
          backgroundColor: tokens.bgCard,
          borderColor: tokens.hairline,
        },
      ]}
    >
      <Text style={styles.emoji}>
        {achievementEmoji(achievement.iconKey)}
      </Text>
      <Text
        style={[styles.name, { color: earned ? tokens.fg1 : tokens.fg2 }]}
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text
        style={[styles.description, { color: tokens.fg3 }]}
        numberOfLines={3}
      >
        {description}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  tile: {
    minHeight: 156,
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tileLocked: {
    opacity: 0.45,
  },
  emoji: {
    fontSize: 30,
    lineHeight: 34,
    marginBottom: 8,
  },
  name: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
})
