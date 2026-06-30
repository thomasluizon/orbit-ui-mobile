'use client'

import { useTranslations } from 'next-intl'
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
        <div className="flex flex-col items-center px-8 py-10 text-center" style={{ gap: 8 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 600, color: 'var(--fg-1)' }}>
            {t('social.friends.emptyTitle')}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-3)' }}>
            {t('social.friends.emptyBody')}
          </p>
        </div>
      ) : (
        friends.map((friend) => <FriendRow key={friend.userId} friend={friend} onCheer={onCheer} />)
      )}
    </div>
  )
}
