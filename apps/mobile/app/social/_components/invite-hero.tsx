import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy, Share2 } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { useReferral } from '@/hooks/use-referral'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const QR_DARK = '#0b1020'
const QR_LIGHT = '#ffffff'

/** Invite-link hero on the add-friend surface: the user's referral link with a QR, copy, and
 *  native share — a low-friction way to pull a friend into Orbit. */
export function InviteHero() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { referralUrl } = useReferral()
  const [copied, setCopied] = useState(false)

  if (!referralUrl) return null

  function copyLink() {
    Clipboard.setString(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function shareLink() {
    try {
      await Share.share({ title: t('social.invite.title'), message: referralUrl })
    } catch {}
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>{t('social.invite.title')}</Text>
        <Text style={styles.subtitle}>{t('social.invite.subtitle')}</Text>
      </View>

      <View style={styles.qrPlate}>
        <QRCode value={referralUrl} size={128} color={QR_DARK} backgroundColor={QR_LIGHT} />
      </View>
      <Text style={styles.scanHint}>{t('social.invite.scanHint')}</Text>

      <View style={styles.linkWell}>
        <Text style={styles.linkText} numberOfLines={1}>
          {referralUrl}
        </Text>
        <Pressable
          onPress={copyLink}
          accessibilityRole="button"
          accessibilityLabel={t('social.invite.copy')}
          style={({ pressed }) => [
            styles.copyChip,
            { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          ]}
        >
          {copied ? (
            <Check size={14} color={tokens.statusDone} strokeWidth={1.8} />
          ) : (
            <Copy size={14} color={tokens.fg2} strokeWidth={1.8} />
          )}
          <Text style={styles.copyChipText}>
            {copied ? t('social.invite.copied') : t('social.invite.copy')}
          </Text>
        </Pressable>
      </View>

      <PillButton
        fullWidth
        onPress={shareLink}
        leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
      >
        {t('social.invite.share')}
      </PillButton>
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    card: {
      borderRadius: 18,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 18,
      alignItems: 'center',
      gap: 14,
    },
    heading: { alignItems: 'center', gap: 4 },
    title: { fontFamily: 'Rubik_600SemiBold', fontSize: 18, color: tokens.fg1, textAlign: 'center' },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 19,
      color: tokens.fg3,
      textAlign: 'center',
    },
    qrPlate: { borderRadius: 16, backgroundColor: QR_LIGHT, padding: 10 },
    scanHint: { fontFamily: 'Rubik_400Regular', fontSize: 12, color: tokens.fg4 },
    linkWell: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgSunk,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 4,
    },
    linkText: { flex: 1, fontFamily: 'Roboto_400Regular', fontSize: 14, color: tokens.fg2 },
    copyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      minHeight: 40,
    },
    copyChipText: { fontFamily: 'Rubik_500Medium', fontSize: 13, color: tokens.fg2 },
  })
}
