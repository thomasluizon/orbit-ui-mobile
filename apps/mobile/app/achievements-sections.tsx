import { View, Text, StyleSheet } from 'react-native'
import type { Achievement } from '@orbit/shared/types/gamification'
import { createTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { useDateFormat } from '@/hooks/use-date-format'

type Tokens = ReturnType<typeof createTokensV2>
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: TranslationFn
  tokens: Tokens
}

// Rarity glyphs per v8 spec — shape, not color. Earned rows are full-tone, locked are dimmed.
const RARITY_GLYPHS: Record<string, string> = {
  common: '◇',
  uncommon: '◈',
  rare: '◆',
  epic: '★',
  legendary: '✦',
}

function rarityGlyph(rarity: string): string {
  return RARITY_GLYPHS[rarity.toLowerCase()] ?? '◇'
}

/**
 * v8 achievement category section: SectionLabel + hairline rows.
 * Each row: rarity glyph (16 mono) · name + desc · trailing earned/locked meta.
 */
export function AchievementCategorySection({
  category,
  t,
  tokens,
}: Readonly<AchievementCategorySectionProps>) {
  const { displayDate } = useDateFormat()

  return (
    <>
      <SectionLabel>{t(`gamification.categories.${category.key}`)}</SectionLabel>
      {category.items.map((achievement) => {
        const earned = achievement.isEarned
        const glyph = rarityGlyph(achievement.rarity)
        const name = t(`gamification.achievements.${achievement.id}.name`)
        const description = t(
          `gamification.achievements.${achievement.id}.description`,
        )
        const trailing = earned && achievement.earnedAtUtc
          ? t('gamification.page.earnedOn', {
              date: displayDate(new Date(achievement.earnedAtUtc)),
            })
          : t('gamification.locked')

        return (
          <View
            key={achievement.id}
            style={[
              styles.row,
              { borderBottomColor: tokens.hairline },
            ]}
          >
            <Text
              style={[
                styles.glyph,
                { color: earned ? tokens.fg1 : tokens.fg4 },
              ]}
            >
              {glyph}
            </Text>
            <View style={styles.body}>
              <Text
                style={[
                  styles.name,
                  { color: earned ? tokens.fg1 : tokens.fg3 },
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
              {earned ? (
                <Text
                  style={[styles.description, { color: tokens.fg3 }]}
                  numberOfLines={2}
                >
                  {description}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.trailing,
                {
                  color: earned ? tokens.fg3 : tokens.fg4,
                  fontStyle: earned ? 'normal' : 'italic',
                },
              ]}
              numberOfLines={1}
            >
              {trailing}
            </Text>
          </View>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  glyph: {
    fontFamily: 'GeistMono',
    fontSize: 16,
    width: 18,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontFamily: 'Geist',
    fontSize: 15,
  },
  description: {
    fontFamily: 'Geist',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  trailing: {
    fontFamily: 'GeistMono',
    fontSize: 11,
    maxWidth: 110,
    textAlign: 'right',
  },
})
