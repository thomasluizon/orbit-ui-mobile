'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Cheer } from '@orbit/shared/types/social'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useCheers, useFriendFeed } from '@/hooks/use-friends'
import { FeedEventCard } from './feed-event-card'
import { FriendProfileView } from './friend-profile-view'
import { SocialSectionLoadError, SocialSectionSpinner } from './social-section-states'
import type { CheerTarget } from './cheer-composer'

interface SocialFeedProps {
  onCheer: (target: CheerTarget) => void
  onAddFriends: () => void
}

/** A received-cheer row. When the sender is a known user the identity opens their friend profile,
 *  mirroring the activity feed rows; a cheer without a sender id stays a plain, non-interactive row. */
function CheerRow({ cheer }: Readonly<{ cheer: Cheer }>) {
  const t = useTranslations()
  const [profileOpen, setProfileOpen] = useState(false)
  const name = cheer.senderDisplayName
  const text = cheer.note
    ? t('social.feed.cheeredYouWithNote', { name, note: cheer.note })
    : t('social.feed.cheeredYou', { name })
  const textStyle = {
    margin: 0,
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--fg-2)',
  } as const

  if (!cheer.senderId) {
    return (
      <div className="flex items-center" style={{ gap: 12, padding: '10px 20px' }}>
        <UserAvatar name={name} size={38} />
        <p className="flex-1 min-w-0" style={textStyle}>
          {text}
        </p>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        aria-label={t('social.feed.viewProfile', { name })}
        onClick={() => setProfileOpen(true)}
        className="flex w-full min-w-0 cursor-pointer appearance-none items-center border-0 bg-transparent text-left transition-[background-color,transform] hover:bg-[var(--bg-elev)] active:scale-[0.99]"
        style={{ gap: 12, padding: '10px 20px' }}
      >
        <UserAvatar name={name} size={38} />
        <p className="min-w-0 flex-1" style={textStyle}>
          {text}
        </p>
      </button>

      <FriendProfileView
        userId={cheer.senderId}
        displayName={name}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}

/** Feed sub-tab: a "cheers for you" strip above a keyset-paginated activity feed. No ranking. */
export function SocialFeed({ onCheer, onAddFriends }: Readonly<SocialFeedProps>) {
  const t = useTranslations()
  const feed = useFriendFeed()
  const cheers = useCheers('received')

  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const receivedCheers = cheers.data?.items ?? []
  const isEmpty = !feed.isLoading && items.length === 0 && receivedCheers.length === 0

  const renderFeed = () => {
    if (feed.isLoading) return <SocialSectionSpinner />
    if (feed.isError) return <SocialSectionLoadError onRetry={() => void feed.refetch()} />
    if (isEmpty) {
      return (
        <EmptyState
          title={t('social.feed.emptyTitle')}
          description={t('social.feed.emptyBody')}
          action={{
            label: t('social.feed.emptyCta'),
            onClick: onAddFriends,
            variant: 'secondary',
          }}
        />
      )
    }
    return (
      <div className="stagger-enter">
        {items.map((item) => (
          <FeedEventCard key={item.id} item={item} onCheer={onCheer} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{ paddingBottom: 24 }}
    >
      {receivedCheers.length > 0 && (
        <div>
          <SectionLabel>{t('social.feed.cheersForYou')}</SectionLabel>
          <div className="stagger-enter">
            {receivedCheers.map((cheer) => (
              <CheerRow key={cheer.id} cheer={cheer} />
            ))}
          </div>
        </div>
      )}

      {renderFeed()}

      {feed.hasNextPage && (
        <div className="flex justify-center" style={{ padding: '12px 20px' }}>
          <PillButton
            variant="ghost"
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            busy={feed.isFetchingNextPage}
          >
            {feed.isFetchingNextPage ? t('social.feed.loading') : t('social.feed.loadMore')}
          </PillButton>
        </div>
      )}
    </div>
  )
}
