import { useMemo, useState, useCallback } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy, Gift, Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useReferral } from '@/hooks/use-referral'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralDrawerProps {
  open: boolean
  onClose: () => void
}

/** Referral sheet: hero icon disc, mono link well with copy, primary share pill,
 *  progress rows, and a kit InfoCard explainer. */
export function ReferralDrawer({ open, onClose }: Readonly<ReferralDrawerProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setCopied(false)
  }

  const discountPercent = stats?.discountPercent ?? 10

  const doShare = useCallback(async () => {
    if (!referralUrl) return
    try {
      await Share.share({
        title: t('referral.share.title'),
        message: `${t('referral.share.text', { discount: discountPercent })} ${referralUrl}`,
      })
    } catch {
    }
  }, [referralUrl, discountPercent, t])

  const copyLink = useCallback(() => {
    if (!referralUrl) return
    Clipboard.setString(referralUrl)
    AccessibilityInfo.announceForAccessibility(t('referral.drawer.linkCopied'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [referralUrl, t])

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('referral.drawer.title')}
      snapPoints={['65%', '85%']}
      contentManagesScroll
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={withDrawerContentInset(styles.content)}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={tokens.primary} />
          </View>
        ) : null}

        {isError && !isLoading ? (
          <View
            style={styles.errorContainer}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorText}>
              {error?.message ?? t('errors.loadReferral')}
            </Text>
          </View>
        ) : null}

        {!isLoading && !isError ? (
          <>
            <View style={styles.heroRow}>
              <View
                style={[
                  styles.heroDisc,
                  { backgroundColor: tintFromPrimary(tokens, 0.15) },
                ]}
              >
                <Gift size={30} strokeWidth={1.8} color={tokens.primarySoft} />
              </View>
            </View>

            <View>
              <SectionLabel top={0} bottom={8}>
                {t('referral.drawer.yourLink')}
              </SectionLabel>
              <View style={styles.linkWell}>
                <Text style={styles.linkText} numberOfLines={1}>
                  {referralUrl}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.copyButton,
                    pressed
                      ? [styles.copyButtonPressed, { backgroundColor: tokens.bgElev }]
                      : null,
                  ]}
                  onPress={copyLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('referral.drawer.copyLink')}
                >
                  {copied ? (
                    <Check size={18} color={tokens.statusDone} strokeWidth={1.8} />
                  ) : (
                    <Copy size={18} color={tokens.fg2} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.gutter}>
              <PillButton
                fullWidth
                onPress={() => void doShare()}
                leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
              >
                {t('referral.drawer.share')}
              </PillButton>
            </View>

            {stats ? (
              <View>
                <SettingsRow
                  label={t('referral.drawer.completed')}
                  value={`${stats.successfulReferrals} / ${stats.maxReferrals}`}
                  mono
                  accessory="none"
                  valueColor={tokens.fg1}
                />
                {stats.pendingReferrals > 0 ? (
                  <SettingsRow
                    label={t('referral.drawer.pending')}
                    value={String(stats.pendingReferrals)}
                    mono
                    accessory="none"
                    valueColor={tokens.fg1}
                  />
                ) : null}
                {stats.successfulReferrals > 0 ? (
                  <SettingsRow
                    label={t('referral.drawer.couponsEarned')}
                    value={String(stats.successfulReferrals)}
                    mono
                    accessory="none"
                    valueColor={tokens.statusDone}
                  />
                ) : null}
                <View style={styles.progressBlock}>
                  <ProgressBar
                    progress={stats.successfulReferrals / stats.maxReferrals}
                    label={t('referral.drawer.completed')}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.gutter}>
              <InfoCard
                title={t('referral.drawer.howItWorks')}
                desc={t('referral.drawer.explanation', {
                  discount: discountPercent,
                })}
              />
            </View>

            <Text style={styles.disclaimer}>
              {t('referral.drawer.disclaimer', { discount: discountPercent })}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      gap: 16,
      paddingBottom: 24,
    },
    gutter: {
      paddingHorizontal: 20,
    },
    loadingContainer: {
      paddingVertical: 40,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    errorContainer: {
      marginHorizontal: 20,
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
      borderRadius: 14,
      padding: 14,
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.statusOverdueText,
    },
    heroRow: {
      alignItems: 'center',
      paddingTop: 4,
    },
    heroDisc: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkWell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 5,
    },
    linkText: {
      flex: 1,
      fontFamily: 'Roboto_500Medium',
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    copyButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyButtonPressed: {
      transform: [{ scale: 0.96 }],
    },
    progressBlock: {
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    disclaimer: {
      paddingHorizontal: 20,
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      lineHeight: 18,
    },
  })
}
