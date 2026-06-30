import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FriendRequestSummary } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAcceptFriendRequest, useRemoveFriend } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface FriendRequestRowProps {
  request: FriendRequestSummary
  direction: 'incoming' | 'outgoing'
}

/** A pending friend request: accept/decline when incoming, cancel when outgoing. */
export function FriendRequestRow({ request, direction }: Readonly<FriendRequestRowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showError } = useAppToast()
  const accept = useAcceptFriendRequest()
  const remove = useRemoveFriend()
  const busy = accept.isPending || remove.isPending

  async function handleAccept() {
    try {
      await accept.mutateAsync(request.id)
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  async function handleRemove() {
    try {
      await remove.mutateAsync(request.userId)
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <View style={styles.row}>
      <UserAvatar name={request.displayName} />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {request.displayName}
        </Text>
        <Text style={styles.sub}>
          {direction === 'incoming'
            ? t('social.friends.requestedYou')
            : t('social.friends.youRequested')}
        </Text>
      </View>
      <View style={styles.actions}>
        {direction === 'incoming' ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={handleAccept}
              disabled={busy}
              style={[styles.actionButton, { backgroundColor: tokens.primary }]}
            >
              <Text style={[styles.actionText, { color: tokens.fgOnPrimary }]}>
                {t('social.friends.accept')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleRemove}
              disabled={busy}
              style={[styles.actionButton, { backgroundColor: tokens.bgElev }]}
            >
              <Text style={[styles.actionText, { color: tokens.fg2 }]}>
                {t('social.friends.decline')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={handleRemove}
            disabled={busy}
            style={[styles.actionButton, { backgroundColor: tokens.bgElev }]}
          >
            <Text style={[styles.actionText, { color: tokens.fg2 }]}>
              {t('social.friends.cancel')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    identity: { flex: 1, gap: 2 },
    name: { fontFamily: 'Rubik_500Medium', fontSize: 15, color: tokens.fg1 },
    sub: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    actionText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  })
}
