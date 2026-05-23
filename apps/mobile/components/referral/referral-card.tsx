import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Gift, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useReferral } from '@/hooks/use-referral'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface ReferralCardProps {
  onOpen: () => void
}

export function ReferralCard({ onOpen }: Readonly<ReferralCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme, shadows } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { stats, isLoading } = useReferral()
  const styles = useMemo(() => createStyles(tokens, shadows), [tokens, shadows])

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onOpen}
    >
      <View style={styles.iconContainer}>
        <Gift size={20} color={tokens.primary} />
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
      <ChevronRight size={16} color={tokens.fg3} />
    </TouchableOpacity>
  )
}

function createStyles(tokens: AppTokens, shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      backgroundColor: tokens.bgElev,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 20,
      ...shadows.sm,
      elevation: 2,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: tokens.fg1,
    },
    subtitle: {
      fontSize: 12,
      color: tokens.fg2,
      marginTop: 2,
    },
  })
}
