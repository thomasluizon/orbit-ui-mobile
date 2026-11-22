'use client'


import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  STEP_UP_CODE_LENGTH,
  getStepUpCooldownSeconds,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  isStepUpOperation,
  markStepUpFlowContinued,
  type StepUpOperation,
  type StepUpPhase,
  type StepUpTimingRecord,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { PROFILE_STEP_UP_DESTINATIONS } from '@orbit/shared/utils/profile-routes'
import { getBackLabel } from '@orbit/shared/utils/back-label'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { getHeldAccountId, useAuthStore, useHeldAccountId } from '@/stores/auth-store'
import { useAccountScopedState } from '@/hooks/use-session-reset'

import { getAccountGeneration } from '@/lib/session-epoch'
import {
  confirmApiKeyCreationChallenge,
  requestApiKeyCreationChallenge,
} from '@/lib/actions/api-keys'
import { confirmDeletion, requestDeletion } from '@/lib/actions/auth'
import {
  beginStepUpChallenge,
  clearStepUpTiming,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  markStepUpVerified,
  readStepUpTiming,
} from '@/lib/step-up-storage'
import { ResultDialog } from '@/components/ui/result-dialog'
import { GuidedStepUp, type GuidedStepUpState } from './guided-step-up'

const subscribeClientReady = () => () => {}
const getClientReady = () => true
const getServerNotReady = () => false

/**
 * Runs the emailed-code challenge that guards deleting an account and creating an API key.
 * Both need the account this tab holds, and this route is the one place that cannot simply
 * ask for it.
 */
export function StepUpScreen({ serverAccountId }: Readonly<{ serverAccountId: string | null }>) {
  const heldAccountId = useHeldAccountId()
  const sessionInactive = useAuthStore((state) => state.sessionInactive)
  const accountId = sessionInactive ? null : heldAccountId ?? serverAccountId

  useEffect(() => {
    if (serverAccountId) useAuthStore.getState().adoptServerAccount(serverAccountId)
    const stopMonitor = useAuthStore.getState().startExpiryMonitor()
    return stopMonitor
  }, [serverAccountId])

  return (
    <StepUpScreenContent
      key={accountId ?? 'inactive'}
      accountId={accountId}
      serverAccountId={serverAccountId}
      sessionInactive={sessionInactive}
    />
  )
}

function StepUpScreenContent({
  accountId,
  serverAccountId,
  sessionInactive,
}: Readonly<{
  accountId: string | null
  serverAccountId: string | null
  sessionInactive: boolean
}>) {
  const t = useTranslations('stepUp')
  const translate = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const operationParam = searchParams.get('operation')
  const operation = isStepUpOperation(operationParam) ? operationParam : null
  const { profile } = useProfile()
  const userEmail = useAuthStore((state) => state.user?.email)
  const logout = useAuthStore((state) => state.logout)
  const { displayDate } = useDateFormat()

  const [recordOverride, setRecord] = useAccountScopedState<StepUpTimingRecord | null>(null)
  const clientReady = useSyncExternalStore(
    subscribeClientReady,
    getClientReady,
    getServerNotReady,
  )
  const storedRecord = clientReady && operation ? readStepUpTiming(operation, accountId) : null
  const record = recordOverride ?? storedRecord
  const returnDestination = operation ? PROFILE_STEP_UP_DESTINATIONS[operation].route : '/profile'
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useAccountScopedState<StepUpPhase>('challenge')
  const [code, setCode] = useAccountScopedState('')
  const [attemptsRemaining, setAttemptsRemaining] = useAccountScopedState<number | null>(null)
  const [fieldError, setFieldError] = useAccountScopedState<string | null>(null)
  const [shortSubmits, setShortSubmits] = useAccountScopedState(0)
  const [requestError, setRequestError] = useAccountScopedState<string | null>(null)
  const [requesting, setRequesting] = useAccountScopedState(false)
  const [scheduledDeletionAt, setScheduledDeletionAt] = useAccountScopedState<string | null>(null)

  useEffect(() => {
    if (!clientReady) return
    if (sessionInactive) {
      router.replace('/login')
      return
    }
    if (!operation || (!record && phase !== 'deactivated')) {
      router.replace(returnDestination)
    }
  }, [clientReady, operation, phase, record, returnDestination, router, sessionInactive])

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000)
    return () => globalThis.clearInterval(timer)
  }, [])

  const timingPhase = record ? getStepUpPhaseFromTiming(record, now) : 'challenge'
  const displayPhase = useMemo<StepUpPhase>(() => {
    if (phase === 'checking' || phase === 'deactivated') return phase
    if (timingPhase === 'expired' || timingPhase === 'exhausted') return timingPhase
    return phase
  }, [phase, timingPhase])
  const cooldownSeconds = record ? getStepUpCooldownSeconds(record, now) : 0
  const lockSeconds = record ? getStepUpLockSeconds(record, now) : null
  const email = profile?.email ?? userEmail ?? ''
  const checking = displayPhase === 'checking'
  const exhausted = displayPhase === 'exhausted'
  const expired = displayPhase === 'expired'
  const success = displayPhase === 'deactivated'
  const operationLabel = operation === 'keys' ? t('operationKeys') : t('operationDelete')
  const formattedDeletionDate = scheduledDeletionAt
    ? displayDate(scheduledDeletionAt)
    : ''

  function isCurrentRequest(generation: number, initiatingAccountId: string | null): boolean {
    return getAccountGeneration() === generation
      && !useAuthStore.getState().sessionInactive
      && (getHeldAccountId() ?? serverAccountId) === initiatingAccountId
  }

  async function handleResend() {
    if (!operation || exhausted || requesting || accountId === null) return
    const intendedAccountId = accountId
    const accountGeneration = getAccountGeneration()
    setRequesting(true)
    setRequestError(null)
    try {
      if (operation === 'delete') await requestDeletion(intendedAccountId)
      else await requestApiKeyCreationChallenge(intendedAccountId)
      if (!isCurrentRequest(accountGeneration, intendedAccountId)) {
        setRequestError(translate('errors.api.accountChanged'))
        return
      }
      const next = beginStepUpChallenge(operation, accountId)

      setRecord(next)
      setCode('')
      setAttemptsRemaining(null)
      setFieldError(null)
      setPhase(getStepUpPhaseFromTiming(next, Date.now()))
      setNow(Date.now())
    } catch (error) {
      if (!isCurrentRequest(accountGeneration, accountId)) return
      setRequestError(getFriendlyErrorMessage(error, translate, 'stepUp.requestError'))

    } finally {
      if (isCurrentRequest(accountGeneration, accountId)) setRequesting(false)
    }
  }

  async function handleConfirm() {
    if (!operation || !record || checking || accountId === null) return
    if (code.length !== STEP_UP_CODE_LENGTH) {
      refuseShortCode()
      return
    }
    const intendedAccountId = accountId
    const accountGeneration = getAccountGeneration()

    setPhase('checking')
    setFieldError(null)
    setRequestError(null)
    try {
      if (operation === 'keys') {
        const result = await confirmApiKeyCreationChallenge(code, intendedAccountId)
        if (!isCurrentRequest(accountGeneration, intendedAccountId)) {
          setFieldError(translate('errors.api.accountChanged'))
          setPhase('challenge')
          return
        }

        if (!result.success) {
          handleConfirmationFailure(result.errorCode, result.remaining)
          return
        }
        clearStepUpTiming(operation, accountId)
        markStepUpVerified(operation)
        markStepUpFlowContinued(operation)
        router.replace(returnDestination)
        return
      }
      const result = await confirmDeletion(code, intendedAccountId)
      if (!isCurrentRequest(accountGeneration, intendedAccountId)) {
        setFieldError(translate('errors.api.accountChanged'))
        setPhase('challenge')
        return
      }

      if (!result.success) {
        handleConfirmationFailure(result.errorCode, result.remaining)
        return
      }
      clearStepUpTiming(operation, accountId)
      setScheduledDeletionAt(result.response.scheduledDeletionAt)
      setPhase('deactivated')
    } catch (error) {
      if (!isCurrentRequest(accountGeneration, accountId)) return
      setFieldError(getFriendlyErrorMessage(error, translate, 'stepUp.genericError'))

      setPhase('challenge')
    }
  }

  function handleConfirmationFailure(errorCode: string | null, remaining: number | null) {
    if (!record) return
    if (errorCode === 'TOO_MANY_ATTEMPTS') {
      setExhausted(record)
      return
    }
    if (errorCode === 'CODE_EXPIRED') {
      setPhase('expired')
      return
    }
    if (errorCode === 'INVALID_VERIFICATION_CODE') {
      const next = operation === 'delete' && remaining === null
        ? markStepUpAttemptFailed(record, accountId)
        : record
      if (remaining === 0 || (operation === 'delete' && (next.failedAttempts ?? 0) >= 3)) {
        setExhausted(next)
        return
      }
      setRecord(next)
      setAttemptsRemaining(remaining)
      setFieldError(t('wrong'))
      setPhase('wrong')
      return
    }
    setFieldError(t('genericError'))
    setPhase('challenge')
  }

  function setExhausted(currentRecord: StepUpTimingRecord) {
    const next = markStepUpExhausted(currentRecord, accountId)
    setRecord(next)
    setPhase('exhausted')
    setNow(Date.now())
  }

  function refuseShortCode() {
    setFieldError(translate('auth.errors.codeFormat'))
    setShortSubmits((count) => count + 1)
  }

  function handleCodeChange(value: string) {
    setCode(value)
    setShortSubmits(0)
    setFieldError(null)
    setAttemptsRemaining(null)
    if (phase === 'wrong') setPhase('challenge')
  }

  const otpError = getOtpError(t, fieldError, attemptsRemaining)

  if (!clientReady || sessionInactive || !operation || (!record && !success)) return null

  const surface = { operationLabel, t, operation }
  if (success) {
    return (
      <>
        <StepUpSurface {...surface} state={{ kind: 'success', scheduledAt: scheduledDeletionAt, deletionDate: formattedDeletionDate, showProNotice: Boolean(profile?.hasProAccess), onSignOut: () => void logout() }} />
        <DeletionResult deletionDate={formattedDeletionDate} pro={Boolean(profile?.hasProAccess)} onSignOut={() => void logout()} />
      </>
    )
  }
  if (exhausted) {
    return <StepUpSurface {...surface} state={{ kind: 'exhausted', lockSeconds, backLabel: getBackLabel(returnDestination, translate), onBack: () => router.replace(returnDestination) }} />
  }
  return (
    <StepUpSurface {...surface} state={{
      kind: 'challenge', checking, code, cooldownSeconds, email, expired, otpError, requestError, requesting,
      codeFocusRequest: shortSubmits > 0 ? shortSubmits : undefined,
      onCancel: () => router.replace(returnDestination),
      onCodeChange: handleCodeChange,
      onConfirm: () => void handleConfirm(),
      onResend: () => void handleResend(),
    }} />
  )
}

function StepUpSurface({ operation, state }: Readonly<SharedStepUpViewProps & { operation: StepUpOperation; state: GuidedStepUpState }>) {
  return <GuidedStepUp operation={operation} state={state} />
}

type StepUpTranslator = ReturnType<typeof useTranslations>

function getOtpError(
  t: StepUpTranslator,
  fieldError: string | null,
  attemptsRemaining: number | null,
): string | undefined {
  if (!fieldError) return undefined
  if (attemptsRemaining === null) return fieldError
  const attemptCopy = attemptsRemaining === 1
    ? t('attemptsOne')
    : t('attemptsMany', { count: attemptsRemaining })
  return `${fieldError} ${attemptCopy}`
}

interface SharedStepUpViewProps {
  operationLabel: string
  t: StepUpTranslator
}

function DeletionResult({ deletionDate, pro, onSignOut }: Readonly<{ deletionDate: string; pro: boolean; onSignOut: () => void }>) {
  const t = useTranslations()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={pro ? t('result.account.deletionScheduledPro', { date: deletionDate }) : t('result.account.deletionScheduled', { date: deletionDate })}
      primaryLabel={t('stepUp.signOut')}
      onPrimary={onSignOut}
      onClose={() => setDismissed(true)}
      orbitState="parado"
    />
  )
}
