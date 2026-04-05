import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-habits'
import { ProBadge } from '@/components/ui/pro-badge'
import { colors, radius } from '@/lib/theme'

interface HabitSummaryCardProps {
  date: string
}

export function HabitSummaryCard({ date }: Readonly<HabitSummaryCardProps>) {
  const { t } = useTranslation()
  const { profile } = useProfile()

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale: profile?.language ?? 'en',
    hasProAccess,
    aiSummaryEnabled,
  })

  const showCard = useMemo(
    () => hasProAccess && aiSummaryEnabled,
    [aiSummaryEnabled, hasProAccess],
  )

  if (!showCard) return null

  if (isLoading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <View style={styles.header}>
          <Sparkles size={18} color={colors.primary} />
          <Text style={styles.title}>{t('summary.title')}</Text>
          <ProBadge />
        </View>
        <Text style={styles.loadingText}>{t('summary.loading')}</Text>
        <View style={styles.loadingSkeleton}>
          <View style={styles.loadingLineFull} />
          <View style={styles.loadingLineShort} />
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorText}>{t('summary.error')}</Text>
        <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7}>
          <Text style={styles.retryText}>{t('summary.retry')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!summary) return null

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Sparkles size={18} color={colors.primary} />
        <Text style={styles.title}>{t('summary.title')}</Text>
        <ProBadge />
      </View>
      <Text style={styles.summary}>{summary}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 16,
    gap: 12,
  },
  loadingCard: {
    borderColor: colors.primary_30,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  loadingSkeleton: {
    gap: 8,
  },
  loadingLineFull: {
    height: 12,
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  loadingLineShort: {
    height: 12,
    width: '80%',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
})
