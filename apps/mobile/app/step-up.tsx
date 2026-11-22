
import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  STEP_UP_CODE_LENGTH,
  extractBackendError,
  extractBackendErrorCode,
  extractStepUpAttemptsRemaining,
  getStepUpCooldownSeconds,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  isStepUpOperation,
  markStepUpFlowContinued,
  type StepUpOperation,
  type StepUpPhase,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import {
  accountDeactivationResponseSchema,
  stepUpMessageResponseSchema,
  type AccountDeactivationResponse,
} from '@orbit/shared/types/step-up'
import { apiClient } from '@/lib/api-client'
import {
  beginStepUpChallenge,
  clearStepUpTiming,
  markStepUpAttemptFailed,
  markStepUpExhausted,
  markStepUpVerified,
  readStepUpTiming,
} from '@/lib/step-up-storage'
import { PROFILE_STEP_UP_DESTINATIONS } from '@orbit/shared/utils/profile-routes'
import { getBackLabel } from '@orbit/shared/utils/back-label'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useLogout } from '@/hooks/use-logout'
import { useAuthStore } from '@/stores/auth-store'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { ResultDialog } from '@/components/ui/result-dialog'
import { GuidedStepUp, type GuidedStepUpState } from '@/components/auth/guided-step-up'

export default function StepUpScreen() {
  const accountGeneration = useAccountGeneration()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const sessionPhase = useAuthStore((state) => state.sessionPhase)
  if (sessionPhase !== 'signed-in') return null
  return <StepUpScreenContent key={`${accountGeneration}:${accountId ?? 'none'}`} />
}

function StepUpScreenContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ operation?: string | string[] }>()
  const operationValue = Array.isArray(params.operation)
    ? params.operation[0]
    : params.operation
  const operation = isStepUpOperation(operationValue) ? operationValue : null
  const { profile } = useProfile()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const userEmail = useAuthStore((state) => state.user?.email)
  const logout = useLogout()
  const { displayDate } = useDateFormat()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [record, setRecord] = useState<StepUpTimingRecord | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const returnDestination = operation ? PROFILE_STEP_UP_DESTINATIONS[operation].route : '/profile'
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<StepUpPhase>('challenge')
  const [code, setCode] = useState('')
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [shortSubmits, setShortSubmits] = useState(0)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [scheduledDeletionAt, setScheduledDeletionAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function hydrate() {
      if (!operation) {
        router.replace(returnDestination)
        return
      }
      const stored = await readStepUpTiming(operation, accountId)
      if (!active) return
      if (!stored) {
        router.replace(returnDestination)
        return
      }
      setRecord(stored)
      setPhase(getStepUpPhaseFromTiming(stored, Date.now()))
      setHydrated(true)
    }
    void hydrate()
    return () => {
      active = false
    }
  }, [accountId, operation, returnDestination, router])

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
  const operationLabel = operation === 'keys'
    ? t('stepUp.operationKeys')
    : t('stepUp.operationDelete')
  const formattedDeletionDate = scheduledDeletionAt
    ? displayDate(scheduledDeletionAt)
    : ''

  function isCurrentRequest(generation: number, initiatingAccountId: string): boolean {
    return getAccountGeneration() === generation
      && useAuthStore.getState().sessionPhase === 'signed-in'
      && useAuthStore.getState().user?.userId === initiatingAccountId
  }

  async function requestChallenge() {
    if (operation === 'delete') {
      await apiClient(
        API.auth.requestDeletion,
        { method: 'POST' },
        stepUpMessageResponseSchema,
      )
      return
    }
    await apiClient(
      API.apiKeys.requestCreationChallenge,
      { method: 'POST' },
      stepUpMessageResponseSchema,
    )
  }

  async function handleResend() {
    if (!operation || exhausted || requesting || accountId === null) return
    const initiatingAccountId = accountId
    const generation = getAccountGeneration()
    if (!isCurrentRequest(generation, initiatingAccountId)) return
    setRequesting(true)
    setRequestError(null)
    try {
      await requestChallenge()
      if (!isCurrentRequest(generation, initiatingAccountId)) return
      const next = await beginStepUpChallenge(operation, accountId)
      if (!isCurrentRequest(generation, initiatingAccountId)) return
      setRecord(next)
      setCode('')
      setAttemptsRemaining(null)
      setFieldError(null)
      setPhase(getStepUpPhaseFromTiming(next, Date.now()))
      setNow(Date.now())
    } catch {
      if (isCurrentRequest(generation, initiatingAccountId)) setRequestError(t('stepUp.requestError'))
    } finally {
      if (isCurrentRequest(generation, initiatingAccountId)) setRequesting(false)
    }
  }

  async function handleConfirm() {
    if (!operation || !record || checking || accountId === null) return
    if (code.length !== STEP_UP_CODE_LENGTH) {
      refuseShortCode()
      return
    }
    const initiatingAccountId = accountId
    const generation = getAccountGeneration()
    if (!isCurrentRequest(generation, initiatingAccountId)) return
    setPhase('checking')
    setFieldError(null)
    setRequestError(null)
    try {
      if (operation === 'keys') {
        await apiClient(
          API.apiKeys.confirmCreationChallenge,
          { method: 'POST', body: JSON.stringify({ code }) },
          stepUpMessageResponseSchema,
        )
        if (!isCurrentRequest(generation, initiatingAccountId)) return
        await clearStepUpTiming(operation, accountId)
        if (!isCurrentRequest(generation, initiatingAccountId)) return
        markStepUpVerified(operation)
        markStepUpFlowContinued(operation)
        router.replace(returnDestination)
        return
      }
      const response = await apiClient<AccountDeactivationResponse>(
        API.auth.confirmDeletion,
        { method: 'POST', body: JSON.stringify({ code }) },
        accountDeactivationResponseSchema,
      )
      if (!isCurrentRequest(generation, initiatingAccountId)) return
      await clearStepUpTiming(operation, accountId)
      if (!isCurrentRequest(generation, initiatingAccountId)) return
      setScheduledDeletionAt(response.scheduledDeletionAt)
      setPhase('deactivated')
    } catch (caught: unknown) {
      if (isCurrentRequest(generation, initiatingAccountId)) await handleConfirmationFailure(caught)
    }
  }

  async function handleConfirmationFailure(caught: unknown) {
    if (!operation || !record) return
    const errorCode = extractBackendErrorCode(caught)
    const remaining = extractStepUpAttemptsRemaining(extractBackendError(caught))
    if (errorCode === 'TOO_MANY_ATTEMPTS') {
      await setExhausted(record)
      return
    }
    if (errorCode === 'CODE_EXPIRED') {
      setPhase('expired')
      return
    }
    if (errorCode !== 'INVALID_VERIFICATION_CODE') {
      setFieldError(t('stepUp.genericError'))
      setPhase('challenge')
      return
    }
    const next = operation === 'delete' && remaining === null
      ? await markStepUpAttemptFailed(record, accountId)
      : record
    if (remaining === 0 || (operation === 'delete' && (next.failedAttempts ?? 0) >= 3)) {
      await setExhausted(next)
      return
    }
    setRecord(next)
    setAttemptsRemaining(remaining)
    setFieldError(t('stepUp.wrong'))
    setPhase('wrong')
  }

  async function setExhausted(currentRecord: StepUpTimingRecord) {
    const next = await markStepUpExhausted(currentRecord, accountId)
    setRecord(next)
    setPhase('exhausted')
    setNow(Date.now())
  }

  function refuseShortCode() {
    setFieldError(t('auth.errors.codeFormat'))
    setShortSubmits((count) => count + 1)
  }

  function handleCodeChange(value: string) {
    setCode(value)
    setShortSubmits(0)
    setFieldError(null)
    setAttemptsRemaining(null)
    if (phase === 'wrong') setPhase('challenge')
  }

  const otpError = getMobileOtpError(t, fieldError, attemptsRemaining)

  if (!hydrated || !operation || !record) return null
  const surface = { operationLabel, t, tokens, operation }
  if (success) {
    return (
      <>
        <StepUpSurface {...surface} state={{ kind: 'success', scheduledAt: scheduledDeletionAt, deletionDate: formattedDeletionDate, showProNotice: Boolean(profile?.hasProAccess), onSignOut: () => void logout() }} />
        <DeletionResult deletionDate={formattedDeletionDate} pro={Boolean(profile?.hasProAccess)} onSignOut={() => void logout()} t={t} />
      </>
    )
  }
  if (exhausted) {
    return <StepUpSurface {...surface} state={{ kind: 'exhausted', lockSeconds, backLabel: getBackLabel(returnDestination, t), onBack: () => router.replace(returnDestination) }} />
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

function StepUpSurface({ operation, state }: Readonly<SharedMobileStepUpProps & { operation: StepUpOperation; state: GuidedStepUpState }>) {
  return <GuidedStepUp operation={operation} state={state} />
}

type StepUpTokens = ReturnType<typeof createTokensV2>

function getMobileOtpError(
  t: TFunction,
  fieldError: string | null,
  attemptsRemaining: number | null,
): string | undefined {
  if (!fieldError) return undefined
  if (attemptsRemaining === null) return fieldError
  const attemptCopy = attemptsRemaining === 1
    ? t('stepUp.attemptsOne')
    : t('stepUp.attemptsMany', { count: attemptsRemaining })
  return `${fieldError} ${attemptCopy}`
}

interface SharedMobileStepUpProps {
  operationLabel: string
  t: TFunction
  tokens: StepUpTokens
}

function DeletionResult({ deletionDate, pro, onSignOut, t }: Readonly<{ deletionDate: string; pro: boolean; onSignOut: () => void; t: TFunction }>) {
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
