'use client'

import { useTranslations } from 'next-intl'
import type { FriendRequestSummary } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAcceptFriendRequest, useRemoveFriend } from '@/hooks/use-friends'

interface FriendRequestRowProps {
  request: FriendRequestSummary
  direction: 'incoming' | 'outgoing'
}

const actionButtonStyle = {
  padding: '8px 14px',
  borderRadius: 999,
  border: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
} as const

/** A pending friend request: accept/decline when incoming, cancel when outgoing. */
export function FriendRequestRow({ request, direction }: Readonly<FriendRequestRowProps>) {
  const t = useTranslations()
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
      <div className="flex items-center" style={{ gap: 8 }}>
        {direction === 'incoming' ? (
          <>
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              style={{ ...actionButtonStyle, color: 'var(--fg-on-primary)', background: 'var(--primary)' }}
            >
              {t('social.friends.accept')}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              style={{ ...actionButtonStyle, color: 'var(--fg-2)', background: 'var(--bg-elev)' }}
            >
              {t('social.friends.decline')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            style={{ ...actionButtonStyle, color: 'var(--fg-2)', background: 'var(--bg-elev)' }}
          >
            {t('social.friends.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
