'use client'

import { useTranslations } from 'next-intl'
import type { FriendRequestSummary } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAcceptFriendRequest, useRemoveFriend } from '@/hooks/use-friends'

interface FriendRequestRowProps {
  request: FriendRequestSummary
  direction: 'incoming' | 'outgoing'
}

/** A pending friend request: accept/decline when incoming, cancel when outgoing. */
export function FriendRequestRow({ request, direction }: Readonly<FriendRequestRowProps>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const accept = useAcceptFriendRequest()
  const remove = useRemoveFriend()

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
    <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
      <UserAvatar name={request.displayName} />
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}
        >
          {request.displayName}
        </p>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {direction === 'incoming'
            ? t('social.friends.requestedYou')
            : t('social.friends.youRequested')}
        </p>
      </div>
      <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
        {direction === 'incoming' ? (
          <>
            <PillButton
              variant="primary"
              size="sm"
              onClick={() => void handleAccept()}
              busy={accept.isPending}
              disabled={remove.isPending}
            >
              {t('social.friends.accept')}
            </PillButton>
            <PillButton
              variant="ghost"
              size="sm"
              onClick={() => void handleRemove()}
              busy={remove.isPending}
              disabled={accept.isPending}
            >
              {t('social.friends.decline')}
            </PillButton>
          </>
        ) : (
          <PillButton
            variant="ghost"
            size="sm"
            onClick={() => void handleRemove()}
            busy={remove.isPending}
          >
            {t('social.friends.cancel')}
          </PillButton>
        )}
      </div>
    </div>
  )
}
