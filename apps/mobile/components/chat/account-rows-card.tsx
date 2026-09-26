import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Pressable, Share, Text, View } from 'react-native'
import Animated, { Keyframe, ReduceMotion } from 'react-native-reanimated'
import Clipboard from '@react-native-clipboard/clipboard'
import type { AccountRowsCard as AccountRowsCardData } from '@orbit/shared/types/chat'
import { accountRowLabelKey, formatAccountRowValue } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ListRow } from '@/components/ui/list-row'
import { Button } from '@/components/ui/pill-button'
import { Check, Copy } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const iconEnter = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.25 }] }, 100: { opacity: 1, transform: [{ scale: 1 }] } }).duration(200).reduceMotion(ReduceMotion.System)
const iconExit = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.25 }] } }).duration(200).reduceMotion(ReduceMotion.System)

export function AccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const rows = accountRows.rows.flatMap((row) => {
    const labelKey = accountRowLabelKey(row.key)
    return labelKey ? [<ListRow key={row.key} title={t(labelKey)} value={formatAccountRowValue(row, i18n.language, t)} wrapValue readOnly chevron={false} />] : []
  })

  function copyCode() {
    if (!accountRows.referralCode) return
    try {
      Clipboard.setString(accountRows.referralCode)
      setCopied(true)
      setFailure(null)
    } catch {
      setFailure(t('chat.account.copyError'))
    }
  }

  async function shareLink() {
    if (!accountRows.referralLink) return
    try {
      await Share.share({ title: t('referral.share.title'), message: accountRows.referralLink })
      setFailure(null)
    } catch {
      setFailure(t('chat.account.shareError'))
    }
  }

  const referral = accountRows.kind === 'referral'
  return <View style={{ width: '100%', marginTop: 8 }}>
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.account.title.${accountRows.kind}`)} count={null} items={[]}
      body={<View style={{ gap: 12 }}>
        <SettingsGroup>{rows}</SettingsGroup>
        {referral && accountRows.referralCode ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}><Text style={{ flexGrow: 1, flexShrink: 1, color: tokens.fg1, fontFamily: 'GeistMono_500Medium', fontSize: 14 }}>{accountRows.referralCode}</Text><Pressable accessibilityRole="button" accessibilityLabel={t(copied ? 'chat.account.copied' : 'chat.account.copy')} onPress={copyCode} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 20, height: 20 }}>{copied ? <Animated.View key="check" entering={iconEnter}><Check size={20} color={tokens.fg2} strokeWidth={1.8} /></Animated.View> : <Animated.View key="copy" exiting={iconExit}><Copy size={20} color={tokens.fg2} strokeWidth={1.8} /></Animated.View>}</View><Text style={{ color: tokens.fg2, fontSize: 14 }}>{t(copied ? 'chat.account.copied' : 'chat.account.copy')}</Text></Pressable></View> : null}
        <Text accessibilityRole="summary" accessibilityLiveRegion="polite" style={{ color: failure ? tokens.statusBadText : tokens.fg2, fontSize: 14 }}>{failure ?? (copied ? t('chat.account.copied') : '')}</Text>
      </View>}
      actions={referral ? (accountRows.referralLink ? <Button variant="ghost" size="sm" onClick={() => void shareLink()}>{t('chat.account.share')}</Button> : undefined) : <Button variant="ghost" size="sm" onClick={() => router.push('/profile')}>{t('chat.account.open')}</Button>} />
  </View>
}
