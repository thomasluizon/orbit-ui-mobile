import { useCallback, useMemo, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { ReferralStats } from '@orbit/shared/types/referral'
import { useReferral } from '@/hooks/use-referral'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { ErrorState } from '@/components/ui/error-state'
import { InfoCard } from '@/components/ui/info-card'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { Sheet } from '@/components/ui/sheet'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralDrawerProps {
  open: boolean
  onClose: () => void
}

interface LoadedContentProps {
  stats: ReferralStats | null
  referralUrl: string
  copied: boolean
  interactionError: boolean
  tokens: ReturnType<typeof createTokensV2>
  styles: ReturnType<typeof createStyles>
  onCopy: () => void
  onShare: () => void
}

function LoadedContent({
  stats,
  referralUrl,
  copied,
  interactionError,
  tokens,
  styles,
  onCopy,
  onShare,
}: Readonly<LoadedContentProps>) {
  const { t } = useTranslation()
  const progress = stats && stats.maxReferrals > 0
    ? stats.successfulReferrals / stats.maxReferrals
    : 0

  return (
    <>
      <View>
        <SectionLabel>
          {t('referral.drawer.yourLink')}
        </SectionLabel>
        <View style={styles.linkWell}>
          <Text style={styles.linkText} numberOfLines={1}>
            {referralUrl}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.copyButton,
              pressed ? styles.copyButtonPressed : null,
            ]}
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel={t('referral.drawer.copyLink')}
          >
            {copied ? (
              <Check size={20} color={tokens.fg2} strokeWidth={1.8} />
            ) : (
              <Copy size={20} color={tokens.fg2} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.gutter}>
        <PillButton onClick={onShare}>
          {t('referral.drawer.share')}
        </PillButton>
      </View>

      {interactionError ? (
        <Text accessibilityRole="alert" style={styles.actionError}>
          {t('referral.drawer.actionFailed')}
        </Text>
      ) : null}

      {stats ? (
        <View>
          <ListRow
            title={t('referral.drawer.completed')}
            value={`${stats.successfulReferrals} / ${stats.maxReferrals}`}
            readOnly
          />
          {stats.pendingReferrals > 0 ? (
            <ListRow
              title={t('referral.drawer.pending')}
              value={String(stats.pendingReferrals)}
              readOnly
            />
          ) : null}
          {stats.successfulReferrals > 0 ? (
            <ListRow
              title={t('referral.drawer.couponsEarned')}
              value={String(stats.successfulReferrals)}
              readOnly
            />
          ) : null}
          <View style={styles.progressBlock}>
            <ProgressBar
              value={progress}
              max={1}
              label={t('referral.drawer.completed')}
            />
          </View>
        </View>
      ) : null}

      {stats ? (
        <>
          <View style={styles.gutter}>
            <InfoCard>
              <Text style={styles.infoTitle}>
                {t('referral.drawer.howItWorks')}
              </Text>
              <Text style={styles.infoBody}>
                {t('referral.drawer.explanation', {
                  discount: stats.discountPercent,
                })}
              </Text>
            </InfoCard>
          </View>
          <Text style={styles.disclaimer}>
            {t('referral.drawer.disclaimer', {
              discount: stats.discountPercent,
            })}
          </Text>
        </>
      ) : null}
    </>
  )
}

function ReferralDrawerContent({ onClose }: Readonly<Pick<ReferralDrawerProps, 'onClose'>>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [interactionError, setInteractionError] = useState(false)

  const shareLink = useCallback(async () => {
    if (!referralUrl) return
    try {
      const referralMessage = stats
        ? t('referral.share.text', { discount: stats.discountPercent })
        : t('referral.share.title')
      await Share.share({
        title: t('referral.share.title'),
        message: `${referralMessage} ${referralUrl}`,
      })
      setInteractionError(false)
    } catch {
      setInteractionError(true)
    }
  }, [referralUrl, stats, t])

  const copyLink = useCallback(() => {
    if (!referralUrl) return
    try {
      Clipboard.setString(referralUrl)
      AccessibilityInfo.announceForAccessibility(t('referral.drawer.linkCopied'))
      setInteractionError(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setInteractionError(true)
    }
  }, [referralUrl, t])

  return (
    <Sheet open onClose={onClose} title={t('referral.drawer.title')}>
      <View style={withDrawerContentInset(styles.content)}>
        {isLoading ? (
          <View style={styles.loadingContainer} accessibilityRole="progressbar">
            <ActivityIndicator color={tokens.fg3} />
          </View>
        ) : null}
        {isError ? <ErrorState message={error.message} /> : null}
        {!isLoading && !isError ? (
          <LoadedContent
            stats={stats}
            referralUrl={referralUrl}
            copied={copied}
            interactionError={interactionError}
            tokens={tokens}
            styles={styles}
            onCopy={copyLink}
            onShare={() => void shareLink()}
          />
        ) : null}
      </View>
    </Sheet>
  )
}

/** Referral details and sharing actions in the shared sheet composition. */
export function ReferralDrawer({ open, onClose }: Readonly<ReferralDrawerProps>) {
  return open ? <ReferralDrawerContent onClose={onClose} /> : null
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: {
      gap: 16,
      paddingBottom: 24,
    },
    gutter: {
      paddingHorizontal: 16,
    },
    loadingContainer: {
      paddingVertical: 48,
      alignItems: 'center',
    },
    linkWell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 4,
    },
    linkText: {
      flex: 1,
      fontFamily: 'GeistMono_500Medium',
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
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    actionError: {
      paddingHorizontal: 16,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    progressBlock: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    infoTitle: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg1,
    },
    infoBody: {
      marginTop: 8,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    disclaimer: {
      paddingHorizontal: 16,
      fontFamily: 'Geist_400Regular',
      fontSize: 12,
      lineHeight: 20,
      color: tokens.fg3,
    },
  })
}
