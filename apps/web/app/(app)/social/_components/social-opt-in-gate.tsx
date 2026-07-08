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

/**
 * First-run gate shown when the user has not opted into social: confirms a handle and flips the
 * `socialOptIn` flag. Until enabled, every `/api/friends` call returns 403, so this stands in for
 * the surface rather than letting the reads error.
 */
export function SocialOptInGate() {
  const t = useTranslations()
  const { profile } = useProfile()
  const { showError, showSuccess } = useAppToast()
  const setHandle = useSetHandle()
  const setSocialOptIn = useSetSocialOptIn()
  const [handle, setHandle_] = useState(profile?.handle ?? '')

  const isSubmitting = setHandle.isPending || setSocialOptIn.isPending

  async function handleEnable() {
    const trimmed = handle.trim()
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
    <div className="flex flex-col items-center px-6 py-10 text-center" style={{ gap: 18 }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 28,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {t('social.optInGate.title')}
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: 420,
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
        }}
      >
        {t('social.optInGate.body')}
      </p>
      <div className="flex w-full flex-col text-left" style={{ gap: 6, maxWidth: 420 }}>
        <FieldInput
          label={t('social.optInGate.handleLabel')}
          value={handle}
          onChange={setHandle_}
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
