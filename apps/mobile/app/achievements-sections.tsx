import { View, Text, StyleSheet } from 'react-native'
import { Lock } from 'lucide-react-native'
import type { Achievement } from '@orbit/shared/types/gamification'
import { createTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'

type Tokens = ReturnType<typeof createTokensV2>
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

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
  return (
    <>
      <SectionLabel>{t(`gamification.categories.${category.key}`)}</SectionLabel>
      <View style={styles.groupWrap}>
        <SettingsGroup>
          {category.items.map((achievement) => (
            <AchievementRow
              key={achievement.id}
              achievement={achievement}
              t={t}
              tokens={tokens}
            />
          ))}
        </SettingsGroup>
      </View>
    </>
  )
}

interface AchievementRowProps {
  achievement: Achievement
  t: TranslationFn
  tokens: Tokens
}

function AchievementRow({
  achievement,
  t,
  tokens,
}: Readonly<AchievementRowProps>) {
  const earned = achievement.isEarned
  const glyph = rarityGlyph(achievement.rarity)
  const name = t(`gamification.achievements.${achievement.id}.name`)
  const description = t(`gamification.achievements.${achievement.id}.description`)

  return (
    <View style={styles.row}>
      <Text style={[styles.glyph, { color: earned ? tokens.fg1 : tokens.fg4 }]}>
        {glyph}
      </Text>
      <View style={styles.body}>
        <Text
          style={[
            styles.name,
            {
              color: earned ? tokens.fg1 : tokens.fg3,
              fontWeight: earned ? '500' : '400',
            },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[styles.subtitle, { color: tokens.fg3 }]}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
      {!earned ? (
        <Lock size={14} color={tokens.fg4} strokeWidth={1.5} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  groupWrap: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  glyph: {
    fontFamily: 'GeistMono',
    fontSize: 16,
    width: 20,
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
  subtitle: {
    fontFamily: 'Geist',
    fontSize: 12,
    lineHeight: 16,
  },
})
