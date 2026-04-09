import { useMemo, type ReactNode } from 'react'
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { createColors } from '@/lib/theme'

type AppColors = ReturnType<typeof createColors>

interface ProfileNavCardProps {
  colors: AppColors
  icon: ReactNode
  title: string
  hint: string
  onPress: () => void
  variant?: 'default' | 'primary'
  proBadge?: boolean
  proBadgeLabel?: string
  rightText?: string
}

export function ProfileNavCard({
  colors,
  icon,
  title,
  hint,
  onPress,
  variant = 'default',
  proBadge = false,
  proBadgeLabel,
  rightText,
}: ProfileNavCardProps) {
  const styles = useMemo(() => createProfileNavCardStyles(colors), [colors])
  const isPrimary = variant === 'primary'

  return (
    <TouchableOpacity
      style={[styles.navCard, isPrimary && styles.navCardPrimary]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={rightText ?? hint}
      activeOpacity={0.7}
    >
      <View style={[styles.navCardIcon, isPrimary && styles.navCardIconPrimary]}>
        {icon}
      </View>
      <View style={styles.navCardBody}>
        <View style={styles.navCardTitleRow}>
          <Text style={styles.navCardTitle}>{title}</Text>
          {proBadge && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>{proBadgeLabel}</Text>
            </View>
          )}
        </View>
        <Text style={styles.navCardHint}>{rightText ?? hint}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

function createProfileNavCardStyles(colors: AppColors) {
  return StyleSheet.create({
    navCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderColor: colors.borderMuted,
      borderWidth: 1,
      borderRadius: 24,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      shadowColor: '#000000',
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    navCardPrimary: {
      backgroundColor: colors.primaryTintBg,
      borderColor: colors.primaryTintBorder,
    },
    navCardIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.primary_10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    navCardIconPrimary: {
      backgroundColor: colors.primaryTintIconBg,
    },
    navCardBody: {
      flex: 1,
      minWidth: 0,
    },
    navCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    navCardTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      flexShrink: 1,
    },
    navCardHint: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    proBadge: {
      backgroundColor: colors.primary_20,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    proBadgeText: {
      color: colors.primary,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
  })
}
