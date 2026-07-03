'use client'

import { useTranslations } from 'next-intl'
import { extractBackendStatus, getSocialErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useInvitePreview, useSendFriendRequest } from '@/hooks/use-friends'

interface InviteConfirmSheetProps {
  code: string | null
  onClose: () => void
}

function InviteMessage({ text }: Readonly<{ text: string }>) {
  return (
    <p
      role="status"
      style={{
        margin: 0,
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--fg-2)',
      }}
    >
      {text}
    </p>
  )
}

/** Confirmation surface opened from an invite link (`/social?invite=CODE`): previews the link owner
 *  and sends a one-tap friend request keyed by the referral code. */
export function InviteConfirmSheet({ code, onClose }: Readonly<InviteConfirmSheetProps>) {
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()
  const { data, isLoading, isError, error } = useInvitePreview(code)
  const sendRequest = useSendFriendRequest()

  async function handleSend() {
    if (!code) return
    try {
      await sendRequest.mutateAsync({ referralCode: code })
      showSuccess(t('social.addFriend.success'))
      onClose()
    } catch (err: unknown) {
      showError(t(getSocialErrorKey(err)))
      onClose()
    }
  }

  function renderBody() {
    if (isLoading) {
      return (
        <div className="flex items-center" style={{ gap: 12 }} data-testid="invite-preview-loading">
          <span
            className="shrink-0 rounded-full"
            style={{ width: 44, height: 44, background: 'var(--bg-elev)' }}
          />
          <span
            className="rounded-full"
            style={{ width: 160, height: 14, background: 'var(--bg-elev)' }}
          />
        </div>
      )
    }

    if (isError || !data) {
      const status = extractBackendStatus(error)
      if (status === 403) {
        return <InviteMessage text={t('social.optInGate.body')} />
      }
      const key = status === 404 ? 'social.invite.unknownCode' : 'social.invite.loadError'
      return <InviteMessage text={t(key)} />
    }

    if (data.isSelf) {
      return <InviteMessage text={t('social.invite.self')} />
    }
    if (data.isAlreadyFriend) {
      return <InviteMessage text={t('social.invite.alreadyFriends', { handle: data.handle })} />
    }
    if (data.hasPendingRequest) {
      return <InviteMessage text={t('social.invite.pending', { handle: data.handle })} />
    }

    return (
      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <UserAvatar name={data.displayName} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className="truncate"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}
            >
              {data.displayName}
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
              @{data.handle}
            </span>
          </span>
        </div>
        <PillButton
          fullWidth
          onClick={() => void handleSend()}
          disabled={sendRequest.isPending}
          busy={sendRequest.isPending}
        >
          {sendRequest.isPending ? t('social.addFriend.sending') : t('social.invite.sendRequest')}
        </PillButton>
      </div>
    )
  }

  return (
    <AppOverlay
      open={code !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t('social.invite.confirmTitle')}
    >
      <div className="text-left" style={{ paddingBottom: 8 }}>
        {renderBody()}
      </div>
    </AppOverlay>
  )
}
