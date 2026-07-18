import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { useFriends } from '@/hooks/use-friends'
import { AddFriendForm } from './add-friend-form'
import { FriendProfileSheet, type ProfileTarget } from './friend-profile-sheet'
import { FriendRequestRow } from './friend-request-row'
import { FriendRow } from './friend-row'
import { SocialSectionSkeleton } from './social-section-skeleton'
import type { CheerTarget } from './cheer-composer'

interface SocialFriendsProps {
  onCheer: (target: CheerTarget) => void
}

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

/** Friends sub-tab: add-by-handle/code, incoming/outgoing requests, and the accepted-friends list. */
export function SocialFriends({ onCheer }: Readonly<SocialFriendsProps>) {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useFriends()
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null)
  const friends = data?.friends ?? []
  const incoming = data?.incomingRequests ?? []
  const outgoing = data?.outgoingRequests ?? []

  let friendsContent: ReactNode
  if (isLoading) {
    friendsContent = <SocialSectionSkeleton />
  } else if (isError) {
    friendsContent = (
      <EmptyState
        icon={AlertTriangle}
        description={t('social.errors.loadFailed')}
        action={{
          label: t('common.retry'),
          onPress: () => void refetch(),
          variant: 'secondary',
        }}
      />
    )
  } else if (friends.length === 0) {
    friendsContent = (
      <EmptyState
        title={t('social.friends.emptyTitle')}
        description={t('social.friends.emptyBody')}
      />
    )
  } else {
    friendsContent = friends.map((friend, index) => (
      <Animated.View key={friend.userId} entering={rowEntrance(index)}>
        <FriendRow friend={friend} onCheer={onCheer} onOpenProfile={setProfileTarget} />
      </Animated.View>
    ))
  }

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
      {friendsContent}

      <FriendProfileSheet
        userId={profileTarget?.userId ?? null}
        displayName={profileTarget?.displayName ?? ''}
        open={profileTarget !== null}
        onClose={() => setProfileTarget(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
})
