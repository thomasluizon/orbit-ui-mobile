'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const incoming = data?.incomingRequests ?? []
  const outgoing = data?.outgoingRequests ?? []

  return (
    <div className="flex flex-col" style={{ gap: 4, paddingBottom: 24 }}>
      <SectionLabel>{t('social.addFriend.title')}</SectionLabel>
      <AddFriendForm />

      {incoming.length > 0 && (
        <div>
          <SectionLabel>{t('social.friends.incomingTitle')}</SectionLabel>
          {incoming.map((request) => (
            <FriendRequestRow key={request.id} request={request} direction="incoming" />
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <SectionLabel>{t('social.friends.outgoingTitle')}</SectionLabel>
          {outgoing.map((request) => (
            <FriendRequestRow key={request.id} request={request} direction="outgoing" />
          ))}
        </div>
      )}

      <SectionLabel>{t('social.friends.sectionTitle')}</SectionLabel>
      {friends.length === 0 ? (
        <EmptyState
          title={t('social.friends.emptyTitle')}
          description={t('social.friends.emptyBody')}
        />
      ) : (
        friends.map((friend) => <FriendRow key={friend.userId} friend={friend} onCheer={onCheer} />)
      )}
    </div>
  )
}
