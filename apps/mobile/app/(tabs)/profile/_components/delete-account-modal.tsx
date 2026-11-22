
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@orbit/shared/types/profile'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage, markGuidedFlowCompleted } from '@orbit/shared/utils'
import { getDeleteAccountWarningKeys } from '@orbit/shared/utils/delete-account'
import { apiClient } from '@/lib/api-client'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { useOffline } from '@/hooks/use-offline'
import { useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useSheetHost } from '@/components/ui/sheet'
import { DeleteAccountFlow } from './delete-account-flow'

interface DeleteAccountModalProps {
  open: boolean
  onClose: () => void
  profile: Profile | undefined
}

export function DeleteAccountModal({
  open,
  onClose,
  profile,
}: Readonly<DeleteAccountModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { isOnline } = useOffline()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const { closeSheet } = useSheetHost()
  const [loading, setLoading] = useState(false)
  const requestPending = useRef(false)
  const [error, setError] = useState('')

  const warningKeys = getDeleteAccountWarningKeys(profile, new Date())
  const warningMessage = t(warningKeys.plan)
  const storeCancellationNotice = warningKeys.store ? t(warningKeys.store) : ''
  const [step, setStep] = useState<'warning' | 'send'>('warning')

  function handleClose() {
    setLoading(false)
    setError('')
    setStep('warning')
    onClose()
  }

  async function handleRequestDeletion() {
    if (loading || requestPending.current || !isOnline || accountId === null) return
    const startingAccountGeneration = getAccountGeneration()
    const ownsAccount = () => getAccountGeneration() === startingAccountGeneration
    requestPending.current = true
    setLoading(true)
    setError('')
    try {
      await apiClient(
        API.auth.requestDeletion,
        { method: 'POST' },
        stepUpMessageResponseSchema,
      )
      if (!ownsAccount()) return
      await beginStepUpChallenge('delete', accountId)
      if (!ownsAccount()) return
      closeSheet(() => {
        if (!ownsAccount()) return
        markGuidedFlowCompleted('delete_account')
        handleClose()
        router.push('/step-up?operation=delete')
      })
    } catch (caught: unknown) {
      if (!ownsAccount()) return
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
      if (!ownsAccount()) setLoading(false)
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
      onClose={handleClose}
      onSend={() => { void handleRequestDeletion() }}
    />
  )
}
