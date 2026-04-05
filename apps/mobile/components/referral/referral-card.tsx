import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Gift, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useReferral } from '@/hooks/use-referral'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReferralCardProps {
  onOpen: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReferralCard({ onOpen }: Readonly<ReferralCardProps>) {
  const { t } = useTranslation()
  const { stats, isLoading } = useReferral()

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onOpen}
    >
      <View style={styles.iconContainer}>
        <Gift size={20} color={colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{t('referral.card.title')}</Text>
        <Text style={styles.subtitle}>
          {isLoading && t('referral.card.hint')}
          {!isLoading &&
            stats &&
            t('referral.card.progress', {
              count: stats.successfulReferrals,
              max: stats.maxReferrals,
            })}
          {!isLoading && !stats && t('referral.card.hint')}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    ...shadows.sm,
    elevation: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
})
