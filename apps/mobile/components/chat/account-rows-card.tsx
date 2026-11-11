import { IconButton } from '@/components/ui/icon-button'
import { SPACING, motionDurations } from '@orbit/shared/theme'
import { useState } from 'react'
import { useReferralInvitation } from '@/hooks/use-referral-invitation'
import { useTranslation } from 'react-i18next'
import { Share, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import * as Clipboard from 'expo-clipboard'
import type { AccountRowsCard as AccountRowsCardData } from '@orbit/shared/types/chat'
import { accountRowLabelKey, formatAccountRowValue, presentAccountRows } from '@orbit/shared/chat'
import { BlockFrame } from './read-block-frame'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ListRow } from '@/components/ui/list-row'
import { Check, Copy, Share2 } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { toCssTransition, usePrefersReducedMotion } from '@/lib/motion'

const iconSwapTransition = toCssTransition(['opacity', 'transform', 'filter'], motionDurations.fast)

function iconSwapStyle(visible: boolean, reducedMotion: boolean) {
  const settled = visible || reducedMotion
  return {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: visible ? 1 : 0,
    transform: [{ scale: settled ? 1 : 0.25 }],
    filter: [{ blur: settled ? 0 : 4 }],
    transition: reducedMotion ? 'none' : iconSwapTransition,
  } as const
}

function CopyStateIcon({ copied, color }: Readonly<{ copied: boolean; color: string }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <View style={{ width: 20, height: 20 }}>
    <Animated.View testID="copy-icon" style={iconSwapStyle(!copied, reducedMotion)}><Copy size={20} color={color} strokeWidth={1.8} /></Animated.View>
    <Animated.View testID="check-icon" style={iconSwapStyle(copied, reducedMotion)}><Check size={20} color={color} strokeWidth={1.8} /></Animated.View>
  </View>
}

export function AccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  return accountRows.kind === 'referral'
    ? <ReferralAccountRowsCard accountRows={accountRows} />
    : <AccountRowsContent accountRows={accountRows} />
}

function ReferralAccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  const invitation = useReferralInvitation()
  return <AccountRowsContent accountRows={accountRows} invitation={invitation} />
}

function AccountRowsContent({ accountRows, invitation }: Readonly<{ accountRows: AccountRowsCardData; invitation?: string }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const rows = presentAccountRows(accountRows).flatMap((row) => {
    const labelKey = accountRowLabelKey(row.key)
    return labelKey ? [<ListRow key={row.key} title={t(labelKey)} value={formatAccountRowValue(row, i18n.language, t)} wrapValue valueTextMode={row.key === 'name' || row.key === 'email' ? 'personal' : undefined} readOnly={row.key !== 'name' && row.key !== 'email'} chevron={false} />] : []
  })

  async function copyCode() {
    if (!accountRows.referralCode) return
    try {
      await Clipboard.setStringAsync(accountRows.referralCode)
      setCopied(true)
      setFailure(null)
    } catch {
      setFailure(t('chat.account.copyError'))
    }
  }

  async function shareLink() {
    if (!accountRows.referralLink) return
    try {
      await Share.share({ title: t('referral.share.title'), message: `${invitation} ${accountRows.referralLink}` })
      setFailure(null)
    } catch {
      setFailure(t('chat.account.shareError'))
    }
  }

  const referral = accountRows.kind === 'referral'
  return <View style={{ width: '100%' }}>
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.account.title.${accountRows.kind}`)} count={null} items={[]}
      body={<View style={{ gap: 12 }}>
        <SettingsGroup>{rows}</SettingsGroup>
        {referral && accountRows.referralCode ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.s16 }}><Text style={{ flexGrow: 1, flexShrink: 1, color: tokens.fg1, fontFamily: 'GeistMono_500Medium', fontSize: 14 }}>{accountRows.referralCode}</Text><IconButton label={t(copied ? 'chat.account.copied' : 'chat.account.copy')} onClick={() => { void copyCode() }}><CopyStateIcon copied={copied} color={tokens.fg2} /></IconButton></View> : null}
        <Text accessibilityRole="summary" accessibilityLiveRegion="polite" style={{ color: failure ? tokens.statusBadText : tokens.fg2, fontSize: 14 }}>{failure ?? (copied ? t('chat.account.copied') : '')}</Text>
      </View>}
      actions={referral ? (accountRows.referralLink ? <IconButton label={t('chat.account.share')} onClick={() => void shareLink()}><Share2 size={20} strokeWidth={1.5} accessible={false} /></IconButton> : undefined) : undefined} />
  </View>
}
