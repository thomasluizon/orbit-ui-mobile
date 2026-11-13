'use client'

import { SPACING } from '@orbit/shared/theme'

import { useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resetAccountQueries } from '@orbit/shared/query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { RotateCcw } from '@/components/ui/icons'
import {
  buildAccountScopedStorageKey,
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { resetAccount } from '@/lib/actions/profile'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { ResultDialog } from '@/components/ui/result-dialog'
import { FreshStartFlow } from './fresh-start-flow'
import { FreshStartLists } from './fresh-start-lists'

const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

function FreshStartHero({ body }: Readonly<{ body: string }>) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 16 }}>
      <div
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'color-mix(in srgb, var(--status-overdue) 14%, transparent)',
        }}
      >
        <RotateCcw size={24} strokeWidth={1.8} color="var(--status-overdue)" />
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          color: 'var(--fg-2)',
          lineHeight: 1.5,
          margin: SPACING.s0,
          textWrap: 'pretty',
        }}
      >
        {body}
      </p>
    </div>
  )
}

interface FreshStartModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The flag `orbit_guided_flows`: the one-question flow and its result dialog replace the sheet. */
  guided?: boolean
}

export function FreshStartModal({ open, onOpenChange, guided = false }: Readonly<FreshStartModalProps>) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const router = useRouter()

  const [step, setStep] = useAccountScopedState<'info' | 'confirm'>('info')
  const [confirmText, setConfirmText] = useAccountScopedState('')
  const [loading, setLoading] = useAccountScopedState(false)
  const requestPending = useRef(false)
  const [error, setError] = useAccountScopedState('')
  const [resultShown, setResultShown] = useAccountScopedState(false)
  const { isOnline } = useOffline()

  const isConfirmed = confirmText.trim().toUpperCase() === 'ORBIT'
  const { sheetRef, closeSheet } = useSheetHost()

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
    if (loading || requestPending.current || !isConfirmed || getHeldAccountId() === null || (guided && !isOnline)) return
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
      if (guided) {
        void resetAccountQueries(queryClient, 'signed-in')
        captureGuidedFlowCompleted('fresh_start', 2, false)
        setResultShown(true)
        return
      }
      closeSheet(() => {
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) return

        handleOpenChange(false)
        void resetAccountQueries(queryClient, 'signed-in')
        router.push('/')
        router.refresh()
      })
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

  if (open && guided && resultShown) {
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
  if (open && guided) {
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

  return (
    <>
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={() => handleOpenChange(false)}
        title={
          step === 'info'
            ? t('profile.freshStart.heading')
            : t('profile.freshStart.confirmHeading')
        }
        actions={(
          <FreshStartActions
            step={step}
            isConfirmed={isConfirmed}
            loading={loading}
            error={error}
            onCancel={() => closeSheet()}
            onContinue={() => setStep('confirm')}
            onReset={() => void handleReset()}
          />
        )}
      >
        {step === 'info' ? (
          <FreshStartInfoStep deletedItems={deletedItems} preservedItems={preservedItems} />
        ) : (
          <FreshStartConfirmStep
            confirmText={confirmText}
            onConfirmTextChange={setConfirmText}
            isConfirmed={isConfirmed}
            loading={loading}
            onReset={() => void handleReset()}
          />
        )}
      </Sheet>) : null}
    </>
  )
}

function FreshStartActions({
  step,
  isConfirmed,
  loading,
  error,
  onCancel,
  onContinue,
  onReset,
}: Readonly<{
  step: 'info' | 'confirm'
  isConfirmed: boolean
  loading: boolean
  error: string
  onCancel: () => void
  onContinue: () => void
  onReset: () => void
}>) {
  const t = useTranslations()

  if (step === 'info') {
    return (
      <ActionRow>
        <PillButton size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</PillButton>
        <PillButton size="sm" variant="caution" onClick={onContinue}>
          {t('profile.freshStart.reviewDeletion')}
        </PillButton>
      </ActionRow>
    )
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="m-0"
          style={{
            width: '100%',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--status-bad-text)',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      ) : null}
      <ActionRow>
        <PillButton size="sm" variant="ghost" disabled={loading} onClick={onCancel}>{t('common.cancel')}</PillButton>
        <PillButton
          size="sm"
          variant="caution"
          disabled={!isConfirmed || loading}
          loading={loading}
          onClick={onReset}
        >
          {t('profile.freshStart.deleteData')}
        </PillButton>
      </ActionRow>
    </>
  )
}

function FreshStartInfoStep({
  deletedItems,
  preservedItems,
}: Readonly<{
  deletedItems: string[]
  preservedItems: string[]
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <FreshStartHero body={t('profile.freshStart.description')} />
      <FreshStartLists deletedItems={deletedItems} preservedItems={preservedItems} />
    </div>
  )
}

function FreshStartConfirmStep({
  confirmText,
  onConfirmTextChange,
  isConfirmed,
  loading,
  onReset,
}: Readonly<{
  confirmText: string
  onConfirmTextChange: (value: string) => void
  isConfirmed: boolean
  loading: boolean
  onReset: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <Input
        label={t('profile.freshStart.confirmLabel')}
        mono
        value={confirmText}
        onChange={onConfirmTextChange}
        placeholder={t('profile.freshStart.confirmPlaceholder')}
        hint={t('profile.freshStart.confirmInstruction')}
        autoComplete="off"
        autoFocus
        onSubmit={() => {
          if (isConfirmed && !loading) onReset()
        }}
      />
    </div>
  )
}
