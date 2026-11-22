'use client'

import { useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resetAccountQueries } from '@orbit/shared/query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  buildAccountScopedStorageKey,
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
  isFreshStartConfirmed,
} from '@orbit/shared/utils'
import { resetAccount } from '@/lib/actions/profile'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { ResultDialog } from '@/components/ui/result-dialog'
import { FreshStartFlow } from './fresh-start-flow'

const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

interface FreshStartModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FreshStartModal({ open, onOpenChange }: Readonly<FreshStartModalProps>) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const router = useRouter()

  const [step, setStep] = useAccountScopedState<'info' | 'confirm'>('info')
  const [confirmText, setConfirmText] = useAccountScopedState('')
  const [loading, setLoading] = useAccountScopedState(false)
  const requestPending = useRef(false)
  const [error, setError] = useAccountScopedState('')
  const [resultShown, setResultShown] = useAccountScopedState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const { isOnline } = useOffline()

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setStep('info')
      setConfirmText('')
      setError('')
      setLoading(false)
      setResultShown(false)
    }
  }

  const isConfirmed = isFreshStartConfirmed(confirmText)

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        setStep('info')
        setConfirmText('')
        setError('')
        setLoading(false)
        setResultShown(false)
      }
      onOpenChange(value)
    },
    [onOpenChange, setConfirmText, setError, setLoading, setResultShown, setStep],
  )

  async function handleReset() {
    if (loading || requestPending.current || !isConfirmed || getHeldAccountId() === null || (!isOnline)) return
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    requestPending.current = true
    setLoading(true)
    setError('')
    try {
      await resetAccount(intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setError(t('errors.api.accountChanged'))
        return
      }

      localStorage.removeItem('orbit-checklist-templates')
      localStorage.removeItem('orbit:checklist-templates')
      localStorage.removeItem(TRIAL_EXPIRED_SEEN_STORAGE_KEY)
      const accountId = getHeldAccountId()
      if (accountId !== null) {
        localStorage.removeItem(buildAccountScopedStorageKey(TRIAL_EXPIRED_SEEN_STORAGE_KEY, accountId))
      }
      void resetAccountQueries(queryClient, 'signed-in')
      captureGuidedFlowCompleted('fresh_start', 2, false)
      setResultShown(true)
      return
    } catch (err: unknown) {
      if (getAccountGeneration() !== accountGeneration) return
      setError(getFriendlyErrorMessage(err, t, 'profile.freshStart.errorGeneric', 'generic'))
    } finally {
      requestPending.current = false
      if (getAccountGeneration() === accountGeneration) setLoading(false)
    }
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)

  if (open && resultShown) {
    return (
      <ResultDialog
        title={t('result.title')}
        sentence={t('result.account.freshStart')}
        primaryLabel={t('result.account.openToday')}
        onPrimary={() => { handleOpenChange(false); router.push('/') }}
        onClose={() => handleOpenChange(false)}
        orbitState="parado"
      />
    )
  }
  if (open) {
    return (
      <FreshStartFlow
        step={step}
        deletedItems={deletedItems}
        preservedItems={preservedItems}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        loading={loading}
        error={error}
        offline={!isOnline}
        onContinue={() => setStep('confirm')}
        onBack={() => setStep('info')}
        onClose={() => handleOpenChange(false)}
        onReset={() => void handleReset()}
      />
    )
  }

  return null
}
