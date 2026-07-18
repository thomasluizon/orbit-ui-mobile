'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { handleSchema } from '@orbit/shared/types/social'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { useSetHandle, useSetSocialOptIn } from '@/hooks/use-friends'
import { useTopbarHeading } from '@/components/shell/topbar-slot'

/**
 * First-run gate shown when the user has not opted into social: confirms a handle and flips the
 * `socialOptIn` flag. Until enabled, every `/api/friends` call returns 403, so this stands in for
 * the surface rather than letting the reads error.
 */
export function SocialOptInGate() {
  const t = useTranslations()
  useTopbarHeading({ ownedByPage: true })
  const { profile } = useProfile()
  const { showError, showSuccess } = useAppToast()
  const setHandle = useSetHandle()
  const setSocialOptIn = useSetSocialOptIn()
  const [handleInput, setHandleInput] = useState(profile?.handle ?? '')

  const isSubmitting = setHandle.isPending || setSocialOptIn.isPending

  async function handleEnable() {
    const trimmed = handleInput.trim()
    if (!handleSchema.safeParse(trimmed).success) {
      showError(t('social.optInGate.handleHint'))
      return
    }
    try {
      if (trimmed !== profile?.handle) {
        await setHandle.mutateAsync(trimmed)
      }
      await setSocialOptIn.mutateAsync(true)
      showSuccess(t('social.optInGate.success'))
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
      <h1 className="t-h1" style={{ maxWidth: '28ch', textWrap: 'balance' }}>
        {t('social.optInGate.title')}
      </h1>
      <p className="t-body" style={{ maxWidth: '46ch', color: 'var(--fg-2)', textWrap: 'pretty' }}>
        {t('social.optInGate.body')}
      </p>
      <div className="flex w-full min-w-0 flex-col gap-2 text-left" style={{ maxWidth: 420 }}>
        <FieldInput
          label={t('social.optInGate.handleLabel')}
          value={handleInput}
          onChange={setHandleInput}
          placeholder={t('social.optInGate.handlePlaceholder')}
          maxLength={20}
          ariaLabel={t('social.optInGate.handleLabel')}
        />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('social.optInGate.handleHint')}
        </span>
      </div>
      <div className="w-full" style={{ maxWidth: 360 }}>
        <PillButton onClick={() => void handleEnable()} disabled={isSubmitting} busy={isSubmitting} fullWidth>
          {isSubmitting ? t('social.optInGate.enabling') : t('social.optInGate.enable')}
        </PillButton>
      </div>
    </div>
  )
}
