import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SectionLabel } from '@/components/ui/section-label'
import { useFriends } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AddFriendForm } from './add-friend-form'
import { FriendRequestRow } from './friend-request-row'
import { FriendRow } from './friend-row'
import type { CheerTarget } from './cheer-composer'

interface SocialFriendsProps {
  onCheer: (target: CheerTarget) => void
}

/** Friends sub-tab: add-by-handle/code, incoming/outgoing requests, and the accepted-friends list. */
export function SocialFriends({ onCheer }: Readonly<SocialFriendsProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const incoming = data?.incomingRequests ?? []
  const outgoing = data?.outgoingRequests ?? []

  return (
    <View style={styles.container}>
      <SectionLabel>{t('social.addFriend.title')}</SectionLabel>
      <AddFriendForm />

      {incoming.length > 0 ? (
        <View>
          <SectionLabel>{t('social.friends.incomingTitle')}</SectionLabel>
          {incoming.map((request) => (
            <FriendRequestRow key={request.id} request={request} direction="incoming" />
          ))}
        </View>
      ) : null}

      {outgoing.length > 0 ? (
        <View>
          <SectionLabel>{t('social.friends.outgoingTitle')}</SectionLabel>
          {outgoing.map((request) => (
            <FriendRequestRow key={request.id} request={request} direction="outgoing" />
          ))}
        </View>
      ) : null}

      <SectionLabel>{t('social.friends.sectionTitle')}</SectionLabel>
      {friends.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('social.friends.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('social.friends.emptyBody')}</Text>
        </View>
      ) : (
        friends.map((friend) => <FriendRow key={friend.userId} friend={friend} onCheer={onCheer} />)
      )}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { paddingBottom: 24 },
    empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 8 },
    emptyTitle: { fontFamily: 'Rubik_600SemiBold', fontSize: 17, color: tokens.fg1, textAlign: 'center' },
    emptyBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg3,
      textAlign: 'center',
    },
  })
}
