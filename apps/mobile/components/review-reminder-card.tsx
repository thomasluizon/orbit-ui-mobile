import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Star } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReviewReminderCardProps {
  onRate: () => void
  onDismiss: () => void
}

export function ReviewReminderCard({
  onRate,
  onDismiss,
}: Readonly<ReviewReminderCardProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Star size={18} color={colors.primary} fill={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{t('reviewPrompt.title')}</Text>
          <Text style={styles.body}>{t('reviewPrompt.body')}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>{t('common.later')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onRate}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>{t('reviewPrompt.cta')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    card: {
      marginBottom: 16,
      padding: 16,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.primary_30,
      backgroundColor: colors.surfaceOverlay,
      gap: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary_15,
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    body: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    primaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.white,
    },
  })
}
