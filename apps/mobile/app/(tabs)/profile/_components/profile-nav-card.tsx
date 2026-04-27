import { useMemo, type ReactNode } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { createColors } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
import { ProBadge } from '@/components/ui/pro-badge'

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
  const selectionMotion = useResolvedMotionPreset('selection')
  const isPrimary = variant === 'primary'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.navCardShell,
        isPrimary && styles.navCardPrimaryShell,
        pressed && styles.navCardPressed,
        pressed && !selectionMotion.reducedMotionEnabled &&
          styles.navCardPressedMotion,
      ]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={rightText ?? hint}
    >
      <View style={[styles.navCardContent, isPrimary && styles.navCardContentPrimary]}>
        <View style={[styles.navCardIcon, isPrimary && styles.navCardIconPrimary]}>
          {icon}
        </View>
        <View style={styles.navCardBody}>
          <View style={styles.navCardTitleRow}>
            <Text style={styles.navCardTitle}>{title}</Text>
            {proBadge && (
              <ProBadge alwaysVisible label={proBadgeLabel} style={styles.proBadgeSpacing} />
            )}
          </View>
          <Text style={styles.navCardHint}>{rightText ?? hint}</Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  )
}

function createProfileNavCardStyles(colors: AppColors) {
  return StyleSheet.create({
    navCardShell: {
      width: '100%',
      borderColor: colors.borderMuted,
      borderWidth: 1,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    navCardContent: {
      backgroundColor: colors.surfaceGround,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },
    navCardPrimaryShell: {
      borderColor: colors.primaryTintBorder,
    },
    navCardContentPrimary: {
      backgroundColor: colors.primaryTintBg,
    },
    navCardPressed: {
      opacity: 0.86,
    },
    navCardPressedMotion: {
      transform: [{ scale: 0.985 }],
    },
    navCardIcon: {
      borderRadius: 16,
      backgroundColor: colors.primary_10,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginRight: 16,
    },
    navCardIconPrimary: {
      backgroundColor: colors.primaryTintIconBg,
    },
    navCardBody: {
      flex: 1,
      minWidth: 0,
      marginRight: 12,
    },
    navCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
      marginTop: 2,
    },
    proBadgeSpacing: {
      marginLeft: 8,
    },
  })
}
