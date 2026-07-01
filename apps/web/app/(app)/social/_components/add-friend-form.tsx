'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useSendFriendRequest } from '@/hooks/use-friends'
import { InviteHero } from './invite-hero'

/** Add a friend by handle or referral code; sends whichever field the user filled. */
export function AddFriendForm() {
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()
  const sendRequest = useSendFriendRequest()
  const [handle, setHandle] = useState('')
  const [referralCode, setReferralCode] = useState('')

  const canSubmit =
    (handle.trim().length > 0 || referralCode.trim().length > 0) && !sendRequest.isPending

  async function handleSubmit() {
    const trimmedHandle = handle.trim()
    const trimmedCode = referralCode.trim()
    if (!trimmedHandle && !trimmedCode) return
    try {
      await sendRequest.mutateAsync(
        trimmedHandle ? { handle: trimmedHandle } : { referralCode: trimmedCode },
      )
      showSuccess(t('social.addFriend.success'))
      setHandle('')
      setReferralCode('')
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <div className="flex flex-col px-5" style={{ gap: 12 }}>
      <InviteHero />
      <FieldInput
        label={t('social.addFriend.handleLabel')}
        value={handle}
        onChange={setHandle}
        placeholder={t('social.addFriend.handlePlaceholder')}
        maxLength={20}
        autoComplete="off"
      />
      <div className="flex items-center" style={{ gap: 10 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-4)' }}>
          {t('social.addFriend.or')}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
      </div>
      <FieldInput
        label={t('social.addFriend.referralLabel')}
        value={referralCode}
        onChange={setReferralCode}
        placeholder={t('social.addFriend.referralPlaceholder')}
        autoComplete="off"
      />
      <PillButton onClick={handleSubmit} disabled={!canSubmit} busy={sendRequest.isPending} fullWidth>
        {sendRequest.isPending ? t('social.addFriend.sending') : t('social.addFriend.submit')}
      </PillButton>
    </div>
  )
}
