import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
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
const GRID_COLUMNS = 3

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
        {category.items.map((achievement) => (
          <AchievementTile
            key={achievement.id}
            achievement={achievement}
            t={t}
            tokens={tokens}
            width={tileWidth}
          />
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
        {
          width,
          backgroundColor: earned ? tokens.bgField : tokens.bgCard,
          borderColor: tokens.hairline,
        },
      ]}
    >
      <Text style={[styles.emoji, !earned && styles.emojiLocked]}>
        {achievementEmoji(achievement.iconKey)}
      </Text>
      <Text
        style={[styles.name, { color: earned ? tokens.fg1 : tokens.fg4 }]}
      >
        {name}
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
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 28,
    lineHeight: 32,
    marginBottom: 8,
  },
  emojiLocked: {
    opacity: 0.5,
  },
  name: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
})
