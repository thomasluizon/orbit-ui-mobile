import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { Achievement } from '@orbit/shared/types/gamification'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rarityColors(rarity: string): { text: string; bg: string } {
  switch (rarity.toLowerCase()) {
    case 'uncommon':
      return { text: '#34d399', bg: 'rgba(52, 211, 153, 0.10)' }
    case 'rare':
      return { text: '#60a5fa', bg: 'rgba(96, 165, 250, 0.10)' }
    case 'epic':
      return { text: '#c084fc', bg: 'rgba(192, 132, 252, 0.10)' }
    case 'legendary':
      return { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.10)' }
    default:
      return { text: colors.textSecondary, bg: colors.surfaceElevated }
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AchievementCardProps {
  achievement: Achievement
  earned: boolean
  earnedDate: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AchievementCard({
  achievement,
  earned,
  earnedDate,
}: Readonly<AchievementCardProps>) {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const rarity = rarityColors(achievement.rarity)

  return (
    <View
      style={[
        styles.card,
        earned ? styles.cardEarned : styles.cardLocked,
      ]}
    >
      {/* Icon */}
      <Text style={styles.icon}>{earned ? '\u2B50' : '\uD83D\uDD12'}</Text>

      {/* Name */}
      <Text style={styles.name}>
        {t(`gamification.achievements.${achievement.id}.name`)}
      </Text>

      {/* Description */}
      <Text style={styles.description}>
        {t(`gamification.achievements.${achievement.id}.description`)}
      </Text>

      {/* Rarity + XP */}
      <View style={styles.metaRow}>
        <View style={[styles.rarityBadge, { backgroundColor: rarity.bg }]}>
          <Text style={[styles.rarityText, { color: rarity.text }]}>
            {t(`gamification.rarity.${achievement.rarity.toLowerCase()}`)}
          </Text>
        </View>
        <Text style={styles.xpText}>
          {t('gamification.xpReward', { n: achievement.xpReward })}
        </Text>
      </View>

      {/* Earned date */}
      {earned && earnedDate ? (
        <Text style={styles.earnedDate}>
          {t('gamification.page.earnedOn', {
            date: format(new Date(earnedDate), 'PPP', {
              locale: dateFnsLocale,
            }),
          })}
        </Text>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 16,
  },
  cardEarned: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary_20,
  },
  cardLocked: {
    backgroundColor: colors.surfaceGround,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    opacity: 0.5,
  },
  icon: {
    fontSize: 24,
    marginBottom: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  description: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.lg,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  xpText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  earnedDate: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
  },
})
