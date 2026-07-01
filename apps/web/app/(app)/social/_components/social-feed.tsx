'use client'

import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { Cheer } from '@orbit/shared/types/social'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useCheers, useFriendFeed } from '@/hooks/use-friends'
import { FeedEventCard } from './feed-event-card'
import type { CheerTarget } from './cheer-composer'

interface SocialFeedProps {
  onCheer: (target: CheerTarget) => void
  onAddFriends: () => void
}

function CheerRow({ cheer }: Readonly<{ cheer: Cheer }>) {
  const t = useTranslations()
  const text = cheer.note
    ? t('social.feed.cheeredYouWithNote', { name: cheer.senderDisplayName, note: cheer.note })
    : t('social.feed.cheeredYou', { name: cheer.senderDisplayName })
  return (
    <div className="flex items-center" style={{ gap: 12, padding: '10px 20px' }}>
      <UserAvatar name={cheer.senderDisplayName} size={38} />
      <p
        className="flex-1 min-w-0"
        style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
      >
        {text}
      </p>
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

  return (
    <div className="flex flex-col" style={{ paddingBottom: 24 }}>
      {receivedCheers.length > 0 && (
        <div>
          <SectionLabel>{t('social.feed.cheersForYou')}</SectionLabel>
          {receivedCheers.map((cheer) => (
            <CheerRow key={cheer.id} cheer={cheer} />
          ))}
        </div>
      )}

      {feed.isLoading ? (
        <div className="flex justify-center" style={{ padding: '48px 0' }}>
          <Loader2 className="size-[22px] animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
      ) : isEmpty ? (
        <EmptyState
          title={t('social.feed.emptyTitle')}
          description={t('social.feed.emptyBody')}
          action={{
            label: t('social.feed.emptyCta'),
            onClick: onAddFriends,
            variant: 'secondary',
          }}
        />
      ) : (
        <div>
          {items.map((item) => (
            <FeedEventCard key={item.id} item={item} onCheer={onCheer} />
          ))}
        </div>
      )}

      {feed.hasNextPage && (
        <div className="flex justify-center" style={{ padding: '12px 20px' }}>
          <PillButton
            variant="ghost"
            onClick={() => feed.fetchNextPage()}
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
