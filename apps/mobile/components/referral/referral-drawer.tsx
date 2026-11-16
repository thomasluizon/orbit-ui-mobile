import { PillButton } from '@/components/ui/pill-button'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useCallback, useMemo, useState } from 'react'
import {
  AccessibilityInfo,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { CopyStateIcon } from '@/components/ui/copy-state-icon'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { useTranslation } from 'react-i18next'
import type { ReferralPresentationStats } from '@orbit/shared/types/referral'
import { REFERRAL_REWARD_COPY_KEYS, selectReferralReward } from '@orbit/shared/utils'
import { useReferral } from '@/hooks/use-referral'
import { captureError } from '@/lib/sentry'
import { ErrorState } from '@/components/ui/error-state'
import { InfoCard } from '@/components/ui/info-card'
import { ListRow } from '@/components/ui/list-row'

import { ActionRow } from '@/components/ui/action-row'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useSheetPresence } from '@/components/ui/sheet-presence'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralDrawerProps {
  open: boolean
  onClose: () => void
}

interface LoadedContentProps {
  stats: ReferralPresentationStats | null
  referralUrl: string
  copied: boolean
  copyFailed: boolean
  tokens: ReturnType<typeof createTokensV2>
  styles: ReturnType<typeof createStyles>
  onCopy: () => void
}

function LoadedContent({
  stats,
  referralUrl,
  copied,
  copyFailed,
  tokens,
  styles,
  onCopy,
}: Readonly<LoadedContentProps>) {
  const { t } = useTranslation()
  const reward = selectReferralReward(stats, Platform.OS !== 'ios')
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
          <MotionPressable
            style={({ pressed }) => [
              styles.copyButton,
              pressed ? styles.copyButtonPressed : null,
            ]}
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel={t('referral.drawer.copyLink')}
          >
            <CopyStateIcon copied={copied} color={tokens.fg2} strokeWidth={1.8} />
          </MotionPressable>
        </View>
      </View>

      {copyFailed ? (
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
          <InfoCard>
            <Text style={styles.infoTitle}>
              {t('referral.drawer.howItWorks')}
            </Text>
            <Text style={styles.infoBody}>
              {t(REFERRAL_REWARD_COPY_KEYS[reward.kind].rewardKey, reward.values)}
            </Text>
          </InfoCard>
          <Text style={styles.disclaimer}>
            {t('referral.reward.eligibility')}
          </Text>
        </>
      ) : null}
    </>
  )
}

function ReferralDrawerContent({ onClose, sheetRef, closeSheet }: Readonly<Pick<ReferralDrawerProps, 'onClose'>
  & Pick<ReturnType<typeof useSheetPresence>, 'sheetRef' | 'closeSheet'>>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [failedAction, setFailedAction] = useState<'copy' | 'share' | null>(null)
  const isLoaded = !isLoading && !isError
  const reward = selectReferralReward(stats, Platform.OS !== 'ios')

  const shareLink = useCallback(async () => {
    if (!referralUrl) return
    try {
      const referralMessage = t(REFERRAL_REWARD_COPY_KEYS[reward.kind].shareKey, reward.values)
      await Share.share({
        title: t('referral.share.title'),
        message: `${referralMessage} ${referralUrl}`,
      })
      setFailedAction(null)
    } catch {
      setFailedAction('share')
    }
  }, [referralUrl, reward.kind, reward.values, t])

  const copyLink = useCallback(async () => {
    if (!referralUrl) return
    try {
      await Clipboard.setStringAsync(referralUrl)
      AccessibilityInfo.announceForAccessibility(t('referral.drawer.linkCopied'))
      setFailedAction(null)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      captureError(error)
      setFailedAction('copy')
    }
  }, [referralUrl, t])

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={onClose}
      title={t('referral.drawer.title')}
      actions={
        isLoaded ? (
          <>
            {failedAction === 'share' ? (
              <Text
                accessibilityRole="alert"
                style={[styles.shareError, { width: '100%' }]}
              >
                {t('referral.drawer.actionFailed')}
              </Text>
            ) : null}
            <ActionRow>
              <PillButton size="sm" variant="ghost" onClick={() => closeSheet()}>{t('common.cancel')}</PillButton>
              <PillButton size="sm" onClick={() => void shareLink()}>{t('referral.drawer.share')}</PillButton>
            </ActionRow>
          </>
        ) : undefined
      }
    >
      <View style={styles.content}>
        {isLoading ? (
          <View testID="referral-skeleton" style={styles.content} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} accessibilityState={{ busy: true }}>
            <View style={styles.linkSkeleton}><Skeleton variant="fill" grouped /></View>
            <Skeleton variant="settings" rows={2} grouped />
          </View>
        ) : null}
        {isError ? <ErrorState message={error.message} /> : null}
        {isLoaded ? (
          <LoadedContent
            stats={stats}
            referralUrl={referralUrl}
            copied={copied}
            copyFailed={failedAction === 'copy'}
            tokens={tokens}
            styles={styles}
            onCopy={() => { void copyLink() }}
          />
        ) : null}
      </View>
    </Sheet>
  )
}

/** Referral details and sharing actions; an owner that turns `open` false closes the sheet through its native dismissal. */
export function ReferralDrawer({ open, onClose }: Readonly<ReferralDrawerProps>) {
  const { mounted, sheetKey, sheetRef, closeSheet } = useSheetPresence(open)
  return mounted ? <ReferralDrawerContent key={sheetKey} onClose={onClose} sheetRef={sheetRef} closeSheet={closeSheet} /> : null
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: {
      gap: 16,
    },
    linkSkeleton: {
      height: TOUCH_TARGET_MIN + SPACING.s8 + 2,
    },
    linkWell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingLeft: SPACING.s16,
      paddingRight: SPACING.s8,
      paddingVertical: SPACING.s4,
    },
    linkText: {
      flex: 1,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    copyButton: {
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      borderRadius: radius.full,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyButtonPressed: {
      backgroundColor: tokens.bgHover,
    },
    actionError: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    shareError: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      color: tokens.fg2,
    },
    progressBlock: {
      paddingVertical: SPACING.s12,
    },
    infoTitle: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg1,
    },
    infoBody: {
      marginTop: SPACING.s8,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    disclaimer: {
      fontFamily: 'Geist_400Regular',
      fontSize: 12,
      lineHeight: 20,
      color: tokens.fg3,
    },
  })
}
