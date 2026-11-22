'use client'

import { useRef } from 'react'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Profile } from '@orbit/shared/types/profile'
import { getFriendlyErrorMessage, markGuidedFlowCompleted } from '@orbit/shared/utils'
import { getDeleteAccountWarningKeys } from '@orbit/shared/utils/delete-account'
import { requestDeletion } from '@/lib/actions/auth'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { useOffline } from '@/hooks/use-offline'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId, useHeldAccountId } from '@/stores/auth-store'
import { useSheetHost } from '@/components/ui/sheet'
import { DeleteAccountFlow } from './delete-account-flow'

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
  const { isOnline } = useOffline()
  const { closeSheet } = useSheetHost()
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

        markGuidedFlowCompleted('delete_account')
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
