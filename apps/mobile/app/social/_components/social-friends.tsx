import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { useFriends } from '@/hooks/use-friends'
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
        <EmptyState
          title={t('social.friends.emptyTitle')}
          description={t('social.friends.emptyBody')}
        />
      ) : (
        friends.map((friend) => <FriendRow key={friend.userId} friend={friend} onCheer={onCheer} />)
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
})
