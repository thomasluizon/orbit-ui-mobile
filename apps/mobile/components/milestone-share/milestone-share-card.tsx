import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import { achievementEmoji } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { OrbitMark } from '@/components/ui/orbit-mark'

export type MilestoneShareVariant =
  | { kind: 'streak'; streak: number }
  | { kind: 'achievement'; achievementId: string; iconKey: string; rarity: string }

interface MilestoneShareCardProps {
  variant: MilestoneShareVariant
  referralUrl: string
}

/** Flat token-native milestone card and the react-native-view-shot capture target. */
export const MilestoneShareCard = forwardRef<View, MilestoneShareCardProps>(
  function MilestoneShareCard({ variant, referralUrl }, ref) {
    const { t } = useTranslation()
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const styles = useMemo(() => createStyles(tokens), [tokens])

    const shortLink = referralUrl.replace(/^https?:\/\//, '')
    const eyebrow =
      variant.kind === 'streak'
        ? t('milestoneShare.streakEyebrow')
        : t('milestoneShare.achievementEyebrow')

    return (
      <View ref={ref} testID="milestone-share-card" style={styles.card}>
        <View style={styles.band}>
          <View style={styles.brandRow}>
            <OrbitMark size={24} accent />
            <Text style={styles.wordmark}>Orbit</Text>
          </View>

          <Text style={styles.eyebrow}>{eyebrow}</Text>

          {variant.kind === 'streak' ? (
            <>
              <Text style={styles.streakNumber}>
                {`${variant.streak} 🔥`}
              </Text>
              <Text style={styles.streakTitle}>
                {t('milestoneShare.streakTitle', { count: variant.streak })}
              </Text>
            </>
          ) : (
            <View style={styles.achievementRow}>
              <Text style={styles.achievementEmoji}>{achievementEmoji(variant.iconKey)}</Text>
              <View style={styles.achievementText}>
                <Text style={styles.achievementName} numberOfLines={2}>
                  {t(`gamification.achievements.${variant.achievementId}.name`)}
                </Text>
                <View style={styles.rarityPill}>
                  <Text style={styles.rarityText}>
                    {t(`milestoneShare.rarity.${variant.rarity}`)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {referralUrl ? (
          <View style={styles.footer}>
            <View style={styles.qrTile}>
              <QRCode value={referralUrl} size={56} color="#020618" backgroundColor="#ffffff" />
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
  },
)

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
    streakNumber: {
      marginTop: 8,
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 56,
      lineHeight: 60,
      letterSpacing: -1.5,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    streakTitle: {
      marginTop: 8,
      fontFamily: 'Geist_500Medium',
      fontSize: 16,
      color: tokens.fg2,
    },
    achievementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 12,
    },
    achievementEmoji: {
      fontSize: 48,
    },
    achievementText: {
      flex: 1,
    },
    achievementName: {
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 22,
      letterSpacing: -0.22,
      color: tokens.fg1,
    },
    rarityPill: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: tokens.bgField,
    },
    rarityText: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.6,
      color: tokens.fg1,
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
