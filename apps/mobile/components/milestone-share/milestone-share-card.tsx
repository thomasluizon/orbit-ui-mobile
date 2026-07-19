import { forwardRef, useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-expo-image -- expo-image is not a project dependency; the only <Image> is a static bundled logo rendered into a react-native-view-shot capture (expo-image does not reliably render in view-shot snapshots), so RN Image is the deliberate correct choice here. Adding a native image library is out of scope for a React Doctor burn-down (SDK 57 native-ABI/rebuild risk). https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import { achievementEmoji } from '@orbit/shared/utils'
import { shareQrColors } from '@orbit/shared/theme'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const logoSource = require('../../assets/logo-no-bg.png') as ImageSourcePropType

export type MilestoneShareVariant =
  | { kind: 'streak'; streak: number }
  | { kind: 'achievement'; achievementId: string; iconKey: string; rarity: string }

interface MilestoneShareCardProps {
  variant: MilestoneShareVariant
  referralUrl: string
}

/** Branded navy-violet milestone card and the react-native-view-shot capture target. Streak variant shows the day count; achievement variant shows emoji, name, and rarity. */
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
            <Image source={logoSource} style={styles.logo} resizeMode="contain" />
            <Text style={styles.wordmark}>Orbit</Text>
          </View>

          <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>

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
                    {t(`milestoneShare.rarity.${variant.rarity}`).toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {referralUrl ? (
          <View style={styles.footer}>
            <View style={styles.qrTile}>
              <QRCode
                value={referralUrl}
                size={56}
                color={shareQrColors.dark}
                backgroundColor={shareQrColors.light}
              />
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
      paddingTop: 20,
      paddingHorizontal: 22,
      paddingBottom: 24,
      backgroundColor: tokens.bgElev,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
      marginTop: 18,
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      color: tokens.fg3,
    },
    streakNumber: {
      marginTop: 6,
      fontFamily: 'Inter_700Bold',
      fontSize: 56,
      lineHeight: 60,
      letterSpacing: -1.6,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    streakTitle: {
      marginTop: 8,
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg2,
    },
    achievementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 10,
    },
    achievementEmoji: {
      fontSize: 52,
    },
    achievementText: {
      flex: 1,
    },
    achievementName: {
      fontFamily: 'Inter_700Bold',
      fontSize: 22,
      letterSpacing: -0.22,
      color: tokens.fg1,
    },
    rarityPill: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.16),
    },
    rarityText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 11.5,
      letterSpacing: 0.6,
      color: tokens.primarySoft,
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
      backgroundColor: shareQrColors.light,
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
