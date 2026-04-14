import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Check, Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useReferral } from '@/hooks/use-referral'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReferralDrawerProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReferralDrawer({ open, onClose }: Readonly<ReferralDrawerProps>) {
  const { t } = useTranslation()
  const { colors, shadows } = useAppTheme()
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

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
      // User cancelled share
    }
  }, [referralUrl, discountPercent, t])

  const copyLink = useCallback(() => {
    if (!referralUrl) return
    // On mobile, "copy" triggers the share sheet which includes a copy option
    doShare()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [referralUrl, doShare])

  const shareLink = doShare

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('referral.drawer.title')}
      snapPoints={['65%', '85%']}
    >
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={withDrawerContentInset(styles.content)}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error?.message ?? t('errors.loadReferral')}
            </Text>
          </View>
        )}

        {/* Loaded */}
        {!isLoading && !isError && (
          <>
            {/* Referral link */}
            <View>
              <Text style={styles.label}>{t('referral.drawer.yourLink')}</Text>
              <View style={styles.linkRow}>
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={1}>
                    {referralUrl}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.copyBtn}
                  activeOpacity={0.8}
                  onPress={copyLink}
                >
                  {copied ? (
                    <Check size={16} color={colors.white} />
                  ) : (
                    <Text style={styles.copyBtnText}>
                      {t('referral.drawer.copy')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Share button */}
            <TouchableOpacity
              style={styles.shareBtn}
              activeOpacity={0.7}
              onPress={shareLink}
            >
              <Text style={styles.shareBtnText}>
                {t('referral.drawer.share')}
              </Text>
            </TouchableOpacity>

            {/* Stats */}
            {stats && (
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>
                    {t('referral.drawer.completed')}
                  </Text>
                  <Text style={styles.statValue}>
                    {stats.successfulReferrals} / {stats.maxReferrals}
                  </Text>
                </View>
                {stats.pendingReferrals > 0 && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>
                      {t('referral.drawer.pending')}
                    </Text>
                    <Text style={[styles.statValue, { color: colors.amber400 }]}>
                      {stats.pendingReferrals}
                    </Text>
                  </View>
                )}
                {stats.successfulReferrals > 0 && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>
                      {t('referral.drawer.couponsEarned')}
                    </Text>
                    <Text style={[styles.statValue, { color: colors.emerald400 }]}>
                      {stats.successfulReferrals}
                    </Text>
                  </View>
                )}
                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          (stats.successfulReferrals / stats.maxReferrals) * 100,
                          100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* How it works */}
            <View style={styles.howItWorks}>
              <Sparkles size={20} color={colors.primary} />
              <View style={styles.howItWorksText}>
                <Text style={styles.howItWorksTitle}>
                  {t('referral.drawer.howItWorks')}
                </Text>
                <Text style={styles.howItWorksDesc}>
                  {t('referral.drawer.explanation', { discount: discountPercent })}
                </Text>
              </View>
            </View>

            {/* Disclaimer */}
            <Text style={styles.disclaimer}>
              {t('referral.drawer.disclaimer', { discount: discountPercent })}
            </Text>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
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
      backgroundColor: colors.red500_10,
      borderWidth: 1,
      borderColor: colors.red500_30,
      borderRadius: radius.lg,
      padding: 16,
    },
    errorText: {
      fontSize: 14,
      color: colors.red400,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    linkRow: {
      flexDirection: 'row',
      gap: 8,
    },
    linkBox: {
      flex: 1,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    linkText: {
      fontSize: 14,
      color: colors.textPrimary,
      fontFamily: 'monospace',
    },
    copyBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyBtnText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '700',
    },
    shareBtn: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shareBtnText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    statsCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 16,
      gap: 12,
      ...shadows.sm,
      elevation: 2,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    progressTrack: {
      height: 8,
      backgroundColor: colors.background,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
    },
    howItWorks: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: colors.primary_10,
      borderWidth: 1,
      borderColor: colors.primary_15,
      borderRadius: radius.lg,
      padding: 16,
    },
    howItWorksText: {
      flex: 1,
    },
    howItWorksTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    howItWorksDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    disclaimer: {
      fontSize: 10,
      color: colors.textMuted,
      lineHeight: 14,
    },
  })
}
