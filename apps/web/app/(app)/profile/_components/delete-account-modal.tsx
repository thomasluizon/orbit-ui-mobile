'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import type { Profile } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { requestDeletion } from '@/app/actions/auth'
import { useDateFormat } from '@/hooks/use-date-format'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { TriangleAlert } from '@/components/ui/icons'

interface DeleteAccountModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | undefined
}

export function DeleteAccountModal({
  open,
  onOpenChange,
  profile,
}: Readonly<DeleteAccountModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const { displayDate } = useDateFormat()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const warningMessage = (() => {
    if (profile?.hasProAccess && profile.planExpiresAt) {
      return t('profile.deleteAccount.warningPro', {
        date: displayDate(parseISO(profile.planExpiresAt)),
      })
    }
    return t('profile.deleteAccount.warningFree')
  })()

  function handleOpenChange(value: boolean) {
    if (!value) {
      setLoading(false)
      setError('')
    }
    onOpenChange(value)
  }

  async function handleRequestDeletion() {
    setLoading(true)
    setError('')
    try {
      await requestDeletion()
      beginStepUpChallenge('delete')
      handleOpenChange(false)
      router.push('/step-up?operation=delete')
    } catch (caught: unknown) {
      setError(
        getFriendlyErrorMessage(
          caught,
          t,
          'profile.deleteAccount.errorGeneric',
          'generic',
        ),
      )
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <Sheet
      open
      onClose={() => handleOpenChange(false)}
      title={t('profile.deleteAccount.headingAreYouSure')}
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="flex flex-col items-center text-center" style={{ gap: 16, paddingTop: 4 }}>
          <div
            aria-hidden="true"
            className="flex items-center justify-center rounded-full"
            style={{
              width: 80,
              height: 80,
              background: 'color-mix(in srgb, var(--status-bad) 14%, transparent)',
            }}
          >
            <TriangleAlert size={34} strokeWidth={1.8} color="var(--status-bad)" />
          </div>
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={{ color: 'var(--fg-1)', fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
              {warningMessage}
            </p>
            <p style={{ color: 'var(--fg-2)', fontSize: 15, lineHeight: 1.5 }}>
              {t('profile.deleteAccount.warningDetail')}
            </p>
          </div>
        </div>
        {error ? (
          <p role="alert" style={{ color: 'var(--status-bad-text)', fontSize: 13 }}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-col" style={{ gap: 12, paddingTop: 8 }}>
          <PillButton
            variant="destructive"
            disabled={loading}
            loading={loading}
            onClick={() => void handleRequestDeletion()}
          >
            {t('profile.deleteAccount.sendCode')}
          </PillButton>
          <PillButton variant="ghost" disabled={loading} onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </PillButton>
        </div>
      </div>
    </Sheet>
  )
}
