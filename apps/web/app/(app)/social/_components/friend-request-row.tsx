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

const actionButtonClass =
  'touch-target-y shrink-0 cursor-pointer rounded-full transition-[background-color,transform,opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:active:scale-[0.96] disabled:opacity-40 disabled:cursor-default'

const actionButtonStyle = {
  padding: '8px 14px',
  border: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
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
              onClick={() => void handleAccept()}
              disabled={busy}
              className={`${actionButtonClass} bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:hover:bg-[var(--primary-pressed)]`}
              style={actionButtonStyle}
            >
              {t('social.friends.accept')}
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className={`${actionButtonClass} bg-[var(--bg-elev)] text-[var(--fg-2)] enabled:hover:bg-[var(--bg-elev-2)]`}
              style={actionButtonStyle}
            >
              {t('social.friends.decline')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={busy}
            className={`${actionButtonClass} bg-[var(--bg-elev)] text-[var(--fg-2)] enabled:hover:bg-[var(--bg-elev-2)]`}
            style={actionButtonStyle}
          >
            {t('social.friends.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
