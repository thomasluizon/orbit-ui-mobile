import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { extractBackendStatus, getSocialErrorKey } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useInvitePreview, useSendFriendRequest } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface InviteConfirmSheetProps {
  code: string | null
  onClose: () => void
}

/** Confirmation sheet opened from an invite link (`/social?invite=CODE`): previews the link owner
 *  and sends a one-tap friend request keyed by the referral code. */
export function InviteConfirmSheet({ code, onClose }: Readonly<InviteConfirmSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const { data, isLoading, isError, error } = useInvitePreview(code)
  const sendRequest = useSendFriendRequest()

  async function handleSend() {
    if (!code) return
    try {
      await sendRequest.mutateAsync({ referralCode: code })
      showSuccess(t('social.addFriend.success'))
      onClose()
    } catch (err: unknown) {
      showError(t(getSocialErrorKey(err)))
      onClose()
    }
  }

  function renderBody() {
    if (isLoading) {
      return (
        <View style={styles.loading} accessibilityLabel={t('common.loading')}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      )
    }

    if (isError || !data) {
      const status = extractBackendStatus(error)
      if (status === 403) {
        return <Text style={styles.message}>{t('social.optInGate.body')}</Text>
      }
      const key = status === 404 ? 'social.invite.unknownCode' : 'social.invite.loadError'
      return <Text style={styles.message}>{t(key)}</Text>
    }

    if (data.isSelf) {
      return <Text style={styles.message}>{t('social.invite.self')}</Text>
    }
    if (data.isAlreadyFriend) {
      return (
        <Text style={styles.message}>{t('social.invite.alreadyFriends', { handle: data.handle })}</Text>
      )
    }
    if (data.hasPendingRequest) {
      return <Text style={styles.message}>{t('social.invite.pending', { handle: data.handle })}</Text>
    }

    return (
      <View style={styles.previewGroup}>
        <View style={styles.identity}>
          <UserAvatar name={data.displayName} />
          <View style={styles.identityText}>
            <Text style={styles.displayName} numberOfLines={1}>
              {data.displayName}
            </Text>
            <Text style={styles.handle}>{`@${data.handle}`}</Text>
          </View>
        </View>
        <PillButton
          fullWidth
          onPress={() => void handleSend()}
          disabled={sendRequest.isPending}
          busy={sendRequest.isPending}
        >
          {sendRequest.isPending ? t('social.addFriend.sending') : t('social.invite.sendRequest')}
        </PillButton>
      </View>
    )
  }

  return (
    <BottomSheetModal
      open={code !== null}
      onClose={onClose}
      title={t('social.invite.confirmTitle')}
      snapPoints={['40%']}
    >
      <View style={styles.content}>{renderBody()}</View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24 },
    loading: { alignItems: 'center', paddingVertical: 32 },
    message: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
    },
    previewGroup: { gap: 16 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    identityText: { flex: 1, minWidth: 0 },
    displayName: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: tokens.fg1,
    },
    handle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
