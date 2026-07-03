'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
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
  const { data, isLoading, isError, refetch } = useFriends()
  const friends = data?.friends ?? []
  const incoming = data?.incomingRequests ?? []
  const outgoing = data?.outgoingRequests ?? []

  return (
    <>
      <div className="xl:col-start-2 xl:row-start-3">
        <SectionLabel>{t('social.addFriend.title')}</SectionLabel>
        <AddFriendForm />
      </div>

      <div
        className="flex flex-col xl:col-start-1 xl:row-start-2 xl:row-span-3 xl:max-w-[65ch]"
        style={{ gap: 4, paddingBottom: 24 }}
      >
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
        {isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex justify-center"
            style={{ padding: '48px 0' }}
          >
            <Loader2 className="size-[22px] animate-spin" style={{ color: 'var(--primary)' }} />
          </div>
        ) : isError ? (
          <EmptyState
            description={t('social.errors.loadFailed')}
            action={{
              label: t('common.retry'),
              onClick: () => void refetch(),
              variant: 'secondary',
            }}
          />
        ) : friends.length === 0 ? (
          <EmptyState
            title={t('social.friends.emptyTitle')}
            description={t('social.friends.emptyBody')}
          />
        ) : (
          <div className="stagger-enter">
            {friends.map((friend) => (
              <FriendRow key={friend.userId} friend={friend} onCheer={onCheer} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
