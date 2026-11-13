'use client'

import { useRef } from 'react'
import { SPACING } from '@orbit/shared/theme'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { getDeleteAccountWarningKeys } from '@orbit/shared/utils/delete-account'
import { requestDeletion } from '@/lib/actions/auth'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { useOffline } from '@/hooks/use-offline'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId, useHeldAccountId } from '@/stores/auth-store'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { TriangleAlert } from '@/components/ui/icons'
import { ErrorState } from '@/components/ui/error-state'
import { DeleteAccountFlow } from './delete-account-flow'

interface DeleteAccountModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | undefined
  /** The flag `orbit_guided_flows`: the one-question flow replaces the sheet. */
  guided?: boolean
}

export function DeleteAccountModal({
  open,
  onOpenChange,
  profile,
  guided = false,
}: Readonly<DeleteAccountModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const { isOnline } = useOffline()
  const { sheetRef, closeSheet } = useSheetHost()
  const accountId = useHeldAccountId()
  const [loading, setLoading] = useAccountScopedState(false)
  const requestPending = useRef(false)
  const [error, setError] = useAccountScopedState('')

  const warningKeys = getDeleteAccountWarningKeys(profile, new Date())
  const warningMessage = t(warningKeys.plan)
  const storeCancellationNotice = warningKeys.store ? t(warningKeys.store) : ''
  const [step, setStep] = useAccountScopedState<'warning' | 'send'>('warning')

  function handleOpenChange(value: boolean) {
    if (!value) {
      setLoading(false)
      setError('')
      setStep('warning')
    }
    onOpenChange(value)
  }

  async function handleRequestDeletion() {
    if (loading || requestPending.current || !isOnline || accountId === null) return
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    requestPending.current = true
    setLoading(true)
    setError('')
    try {
      await requestDeletion(intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setError(t('errors.api.accountChanged'))
        setLoading(false)
        return
      }
      beginStepUpChallenge('delete', accountId)
      closeSheet(() => {
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) return

        handleOpenChange(false)
        router.push('/step-up?operation=delete')
      })
    } catch (caught: unknown) {
      if (getAccountGeneration() !== accountGeneration) return
      setError(
        getFriendlyErrorMessage(
          caught,
          t,
          'profile.deleteAccount.errorGeneric',
          'generic',
        ),
      )
      setLoading(false)
    } finally {
      requestPending.current = false
      if (getAccountGeneration() !== accountGeneration) setLoading(false)
    }
  }

  if (!open) return null
  if (guided) {
    return (
      <DeleteAccountFlow
        step={step}
        warnings={[t('profile.deleteAccount.warning'), [warningMessage, storeCancellationNotice].filter(Boolean).join(' '), t('profile.deleteAccount.warningDetail')]}
        email={profile?.email ?? null}
        offline={!isOnline}
        loading={loading}
        error={error}
        canSend={accountId !== null}
        onContinue={() => setStep('send')}
        onBack={() => { setError(''); setStep('warning') }}
        onClose={() => handleOpenChange(false)}
        onSend={() => void handleRequestDeletion()}
      />
    )
  }

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={() => handleOpenChange(false)}
      title={t('profile.deleteAccount.headingAreYouSure')}
      actions={
        isOnline ? (
          <>
            {error ? (
              <p
                role="alert"
                className="m-0"
                style={{
                  width: '100%',
                  color: 'var(--status-bad-text)',
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            ) : null}
            <ActionRow>
              <PillButton size="sm" variant="ghost" disabled={loading} onClick={() => closeSheet()}>{t('common.cancel')}</PillButton>
              <PillButton
                size="sm"
                variant="destructive"
                disabled={loading || accountId === null}
                loading={loading}
                onClick={() => void handleRequestDeletion()}
              >
                {t('profile.deleteAccount.sendCode')}
              </PillButton>
            </ActionRow>
          </>
        ) : undefined
      }
    >
      {!isOnline ? (
        <ErrorState message={t('profile.deleteAccount.offlineDescription')} />
      ) : (
        <div className="flex flex-col items-center text-center" style={{ gap: 16, paddingTop: SPACING.s4 }}>
          <div
            aria-hidden="true"
            className="flex items-center justify-center rounded-full"
            style={{
              width: 80,
              height: 80,
              background: 'color-mix(in srgb, var(--status-bad) 14%, transparent)',
            }}
          >
            <TriangleAlert size={24} strokeWidth={1.8} color="var(--status-bad)" />
          </div>
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={{ color: 'var(--status-bad-text)', fontSize: 16, fontWeight: 500, lineHeight: 1.5 }}>
              {t('profile.deleteAccount.warning')}
            </p>
            <p style={{ color: 'var(--fg-1)', fontSize: 16, fontWeight: 500, lineHeight: 1.5 }}>
              {[warningMessage, storeCancellationNotice].filter(Boolean).join(' ')}
            </p>
            <p style={{ color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.5 }}>
              {t('profile.deleteAccount.warningDetail')}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  )
}
