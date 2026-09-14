import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  buildShareCardStats,
  buildShareCardWeekday,
  recapPeriodLabelKey,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { OrbitMark } from '@/components/ui/orbit-mark'

interface ShareCardProps {
  recap: Recap
}

/** The 9 by 16 composed Wrapped image captured by react-native-view-shot. */
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ recap }, ref) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const stats = buildShareCardStats(recap.metrics)
  const weekday = buildShareCardWeekday(recap.metrics.weeklyConsistency)

  return (
    <View
      ref={ref}
      testID="share-card"
      style={styles.card}
    >
      <View style={styles.brandRow}>
        <OrbitMark size={28} accent />
        <Text style={styles.wordmark}>Orbit</Text>
        <View style={styles.brandSpacer} />
        <Text style={styles.period}>{t(recapPeriodLabelKey(recap.period))}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.primaryFigure}>
          <Text testID="share-card-figure" style={styles.primaryValue}>
            {stats[0]!.value}
          </Text>
          <Text style={styles.primaryLabel}>{t(stats[0]!.labelKey)}</Text>
        </View>

        <View style={styles.supportingFigures}>
          {stats.slice(1).map((stat) => (
            <View key={stat.labelKey} style={styles.supportingFigure}>
              <Text testID="share-card-figure" style={styles.supportingValue}>
                {stat.value}
              </Text>
              <Text style={styles.supportingLabel}>{t(stat.labelKey)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text testID="share-card-weekday" style={styles.weekday}>
        {t('shareCard.weeklyBarLabel', {
          day: t(weekday.labelKey),
          percent: weekday.percentage,
        })}
      </Text>
    </View>
  )
})

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    card: {
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
      flexDirection: 'column',
      gap: 24,
      overflow: 'hidden',
      padding: 32,
      borderRadius: 20,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    wordmark: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 20,
      letterSpacing: -0.4,
      color: tokens.fg1,
    },
    brandSpacer: {
      flex: 1,
    },
    period: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      color: tokens.fg3,
    },
    body: {
      flex: 1,
      minHeight: 0,
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 24,
    },
    primaryFigure: {
      gap: 4,
    },
    primaryValue: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 88,
      lineHeight: 81,
      letterSpacing: -3.52,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    primaryLabel: {
      fontFamily: 'Geist_400Regular',
      fontSize: 20,
      color: tokens.fg2,
    },
    supportingFigures: {
      gap: 12,
    },
    supportingFigure: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    supportingValue: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 34,
      lineHeight: 34,
      letterSpacing: -0.68,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    supportingLabel: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      color: tokens.fg2,
    },
    weekday: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
      color: tokens.fg3,
    },
  })
}
