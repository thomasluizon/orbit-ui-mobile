import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildShareCardStats, recapPeriodLabelKey } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { StatTile } from '@/components/ui/stat-tile'
import { OrbitMark } from '@/components/ui/orbit-mark'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

interface ShareCardProps {
  recap: Recap
  displayName?: string
}

/** Flat token-native recap card and the react-native-view-shot capture target. */
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { recap, displayName },
  ref,
) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const { metrics, shareDeepLink } = recap
  const stats = buildShareCardStats(metrics)
  const topHabits = metrics.topHabits.slice(0, 3)
  const shortLink = shareDeepLink.replace(/^https?:\/\//, '')
  const eyebrow = [displayName, t(recapPeriodLabelKey(recap.period))]
    .filter(Boolean)
    .join(' · ')

  return (
    <View ref={ref} testID="share-card" style={styles.card}>
      <View style={styles.band}>
        <View style={styles.brandRow}>
          <OrbitMark size={24} accent />
          <Text style={styles.wordmark}>Orbit</Text>
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text testID="share-card-streak" style={styles.streak}>
          {`${t('shareCard.streak', { count: metrics.currentStreak })} 🔥`}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatTile  value={stats[0]!.value} label={t(stats[0]!.labelKey)} />
            <StatTile  value={stats[1]!.value} label={t(stats[1]!.labelKey)} />
          </View>
          <View style={styles.statsRow}>
            <StatTile  value={stats[2]!.value} label={t(stats[2]!.labelKey)} />
            <StatTile  value={stats[3]!.value} label={t(stats[3]!.labelKey)} />
          </View>
        </View>

        <View style={styles.weeklyCard}>
          {metrics.weeklyConsistency.slice(0, 7).map((value, index) => {
            const clamped = Math.max(0, Math.min(100, value))
            const barLabel = t('retrospective.weeklyBarLabel', {
              day: t(`dates.daysShort.${WEEKDAY_KEYS[index]!}`),
              percent: Math.round(clamped),
            })
            return (
              <View
                key={WEEKDAY_KEYS[index]}
                accessible
                accessibilityRole="image"
                accessibilityLabel={barLabel}
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (clamped / 100) * 48),
                    backgroundColor: tokens.primary,
                    opacity: clamped === 0 ? 0.25 : 1,
                  },
                ]}
              />
            )
          })}
        </View>

        {topHabits.length > 0 ? (
          <View style={styles.habitSection}>
            <Text style={styles.habitHeader}>{t('shareCard.stats.topHabits')}</Text>
            <View style={styles.habitChips}>
              {topHabits.map((habit) => (
                <View key={habit.name} style={styles.habitChip}>
                  <Text style={styles.habitEmoji}>{habit.emoji ?? '•'}</Text>
                  <Text style={styles.habitName} numberOfLines={1}>
                    {habit.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {shareDeepLink ? (
        <View style={styles.footer}>
          <View style={styles.qrTile}>
            <QRCode value={shareDeepLink} size={56} color="#020618" backgroundColor="#ffffff" />
          </View>
          <View style={styles.footerText}>
            <Text style={styles.scanText}>{t('shareCard.scanToJoin')}</Text>
            <Text style={styles.shortLink} numberOfLines={1}>
              {shortLink}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
})

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    card: {
      width: 360,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: tokens.bg,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    band: {
      backgroundColor: tokens.bgCard,
      padding: 24,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    wordmark: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 18,
      letterSpacing: -0.18,
      color: tokens.fg1,
    },
    eyebrow: {
      marginTop: 16,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      color: tokens.fg3,
    },
    streak: {
      marginTop: 4,
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 28,
      letterSpacing: -0.56,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    body: {
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
    },
    statsGrid: {
      gap: 12,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    weeklyCard: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      height: 64,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    bar: {
      flex: 1,
      borderRadius: 4,
    },
    habitSection: {
      gap: 8,
    },
    habitHeader: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      color: tokens.fg3,
    },
    habitChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    habitChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    habitEmoji: {
      fontSize: 16,
    },
    habitName: {
      maxWidth: 120,
      fontFamily: 'Geist_500Medium',
      fontSize: 12,
      color: tokens.fg2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    qrTile: {
      padding: 4,
      borderRadius: 12,
      backgroundColor: '#ffffff',
    },
    footerText: {
      flex: 1,
    },
    scanText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 12,
      color: tokens.fg1,
    },
    shortLink: {
      marginTop: 4,
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      color: tokens.fg3,
    },
  })
}
