import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Check, Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useReferral } from '@/hooks/use-referral'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralDrawerProps {
  open: boolean
  onClose: () => void
}

export function ReferralDrawer({ open, onClose }: Readonly<ReferralDrawerProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  useEffect(() => {
    if (open) {
       
      setCopied(false)
    }
  }, [open])

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
    doShare()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [referralUrl, doShare])

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('referral.drawer.title')}
      snapPoints={['65%', '85%']}
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
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error?.message ?? t('errors.loadReferral')}
            </Text>
          </View>
        ) : null}

        {!isLoading && !isError ? (
          <>
            <View style={styles.linkRow}>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={1}>
                  {referralUrl}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.copyBtn}
                activeOpacity={0.7}
                onPress={copyLink}
                accessibilityRole="button"
                accessibilityLabel={t('referral.drawer.copy')}
              >
                {copied ? (
                  <Check size={16} color={tokens.fgOnPrimary} strokeWidth={1.6} />
                ) : (
                  <Text style={styles.copyBtnText}>
                    {t('referral.drawer.copy')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.shareBtn}
              activeOpacity={0.7}
              onPress={doShare}
              accessibilityRole="button"
              accessibilityLabel={t('referral.drawer.share')}
            >
              <Text style={styles.shareBtnText}>
                {t('referral.drawer.share')}
              </Text>
            </TouchableOpacity>

            {stats ? (
              <View>
                <SectionLabel top={4} bottom={0}>
                  {t('referral.drawer.completed')}
                </SectionLabel>
                <SettingsRow
                  label={t('referral.drawer.completed')}
                  value={`${stats.successfulReferrals} / ${stats.maxReferrals}`}
                  mono
                  accessory="none"
                />
                {stats.pendingReferrals > 0 ? (
                  <SettingsRow
                    label={t('referral.drawer.pending')}
                    value={String(stats.pendingReferrals)}
                    mono
                    accessory="none"
                    valueColor={tokens.statusOverdue}
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
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: tokens.bgSunk },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(
                            (stats.successfulReferrals / stats.maxReferrals) *
                              100,
                            100,
                          )}%`,
                          backgroundColor: tokens.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.howItWorks}>
              <View style={styles.howItWorksIcon}>
                <Sparkles
                  size={14}
                  color={tokens.primary}
                  strokeWidth={1.6}
                />
              </View>
              <View style={styles.howItWorksText}>
                <Text style={styles.howItWorksTitle}>
                  {t('referral.drawer.howItWorks')}
                </Text>
                <Text style={styles.howItWorksDesc}>
                  {t('referral.drawer.explanation', {
                    discount: discountPercent,
                  })}
                </Text>
              </View>
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
      paddingHorizontal: 20,
      gap: 16,
      paddingBottom: 24,
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    errorContainer: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      borderRadius: 10,
      padding: 14,
    },
    errorText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
    },
    linkRow: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 4,
    },
    linkBox: {
      flex: 1,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      backgroundColor: tokens.bgElev,
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    linkText: {
      fontFamily: 'GeistMono',
      fontSize: 13,
      color: tokens.fg1,
    },
    copyBtn: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 72,
    },
    copyBtnText: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fgOnPrimary,
    },
    shareBtn: {
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareBtnText: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '500',
      color: tokens.fg1,
    },
    progressBlock: {
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    progressTrack: {
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    howItWorks: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      paddingTop: 14,
    },
    howItWorksIcon: {
      marginTop: 2,
    },
    howItWorksText: {
      flex: 1,
      gap: 4,
    },
    howItWorksTitle: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg1,
    },
    howItWorksDesc: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg2,
      lineHeight: 19,
    },
    disclaimer: {
      fontFamily: 'Geist',
      fontSize: 11,
      color: tokens.fg4,
      lineHeight: 15,
      fontStyle: 'italic',
    },
  })
}
