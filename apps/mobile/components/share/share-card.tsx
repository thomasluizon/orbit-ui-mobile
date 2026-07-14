import { forwardRef, useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-expo-image -- expo-image is not a project dependency; the only <Image> is a static bundled logo rendered into a react-native-view-shot capture (expo-image does not reliably render in view-shot snapshots), so RN Image is the deliberate correct choice here. Adding a native image library is out of scope for a React Doctor burn-down (SDK 57 native-ABI/rebuild risk). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildShareCardStats, recapPeriodLabelKey } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { StatTile } from '@/components/ui/stat-tile'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const logoSource = require('../../assets/logo-no-bg.png') as ImageSourcePropType

interface ShareCardProps {
  recap: Recap
  displayName?: string
}

/** Branded navy-violet recap card and the react-native-view-shot capture target. Reused by share + Wrapped (#198) surfaces. */
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
      <LinearGradient
        colors={[tokens.gradientHeaderFrom, tokens.gradientHeaderTo]}
        style={styles.band}
      >
        <View style={styles.brandRow}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" />
          <Text style={styles.wordmark}>Orbit</Text>
        </View>
        <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
        <Text testID="share-card-streak" style={styles.streak}>
          {`${t('shareCard.streak', { count: metrics.currentStreak })} 🔥`}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatTile emoji={stats[0]!.emoji} value={stats[0]!.value} label={t(stats[0]!.labelKey)} />
            <StatTile emoji={stats[1]!.emoji} value={stats[1]!.value} label={t(stats[1]!.labelKey)} />
          </View>
          <View style={styles.statsRow}>
            <StatTile emoji={stats[2]!.emoji} value={stats[2]!.value} label={t(stats[2]!.labelKey)} />
            <StatTile emoji={stats[3]!.emoji} value={stats[3]!.value} label={t(stats[3]!.labelKey)} />
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
                    height: Math.max(6, (clamped / 100) * 44),
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
            <Text style={styles.habitHeader}>{t('shareCard.stats.topHabits').toUpperCase()}</Text>
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
      paddingTop: 20,
      paddingHorizontal: 22,
      paddingBottom: 22,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    logo: {
      width: 26,
      height: 26,
    },
    wordmark: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 18,
      letterSpacing: -0.18,
      color: tokens.fg1,
    },
    eyebrow: {
      marginTop: 16,
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      color: tokens.fg3,
    },
    streak: {
      marginTop: 4,
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      letterSpacing: -0.56,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    body: {
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
    },
    statsGrid: {
      gap: 10,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    weeklyCard: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      height: 64,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    bar: {
      flex: 1,
      borderRadius: 5,
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
      gap: 6,
    },
    habitChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    habitEmoji: {
      fontSize: 13,
    },
    habitName: {
      maxWidth: 120,
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    qrTile: {
      padding: 6,
      borderRadius: 12,
      backgroundColor: '#ffffff',
    },
    footerText: {
      flex: 1,
    },
    scanText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    shortLink: {
      marginTop: 2,
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      color: tokens.fg3,
    },
  })
}
