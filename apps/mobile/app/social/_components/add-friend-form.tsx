import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useSendFriendRequest } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { InviteHero } from './invite-hero'

/** Add a friend by handle or referral code; sends whichever field the user filled. */
export function AddFriendForm() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const sendRequest = useSendFriendRequest()
  const [handle, setHandle] = useState('')
  const [referralCode, setReferralCode] = useState('')

  const canSubmit =
    (handle.trim().length > 0 || referralCode.trim().length > 0) && !sendRequest.isPending

  async function handleSubmit() {
    const trimmedHandle = handle.trim()
    const trimmedCode = referralCode.trim()
    if (!trimmedHandle && !trimmedCode) return
    try {
      await sendRequest.mutateAsync(
        trimmedHandle ? { handle: trimmedHandle } : { referralCode: trimmedCode },
      )
      showSuccess(t('social.addFriend.success'))
      setHandle('')
      setReferralCode('')
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <View style={styles.container}>
      <InviteHero />
      <Text style={styles.label}>{t('social.addFriend.handleLabel')}</Text>
      <AppTextInput
        value={handle}
        onChangeText={setHandle}
        placeholder={t('social.addFriend.handlePlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.or}>{t('social.addFriend.or')}</Text>
        <View style={styles.line} />
      </View>
      <Text style={styles.label}>{t('social.addFriend.referralLabel')}</Text>
      <AppTextInput
        value={referralCode}
        onChangeText={setReferralCode}
        placeholder={t('social.addFriend.referralPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <PillButton onPress={() => void handleSubmit()} disabled={!canSubmit} busy={sendRequest.isPending} fullWidth>
        {sendRequest.isPending ? t('social.addFriend.sending') : t('social.addFriend.submit')}
      </PillButton>
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { paddingHorizontal: 20, gap: 10 },
    label: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.fg2 },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
    line: { flex: 1, height: 1, backgroundColor: tokens.hairline },
    or: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg4 },
  })
}
