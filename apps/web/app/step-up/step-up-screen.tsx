'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  STEP_UP_CODE_LENGTH,
  formatStepUpCountdown,
  getStepUpCooldownSeconds,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  isStepUpOperation,
  type StepUpPhase,
  type StepUpTimingRecord,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
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
import { FlowShell } from '@/components/shell/flow-shell'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { CapacityNotice } from '@/components/ui/capacity-notice'

const subscribeClientReady = () => () => {}
const getClientReady = () => true
const getServerNotReady = () => false

/**
 * Runs the emailed-code challenge that guards deleting an account and creating an API key.
 *
 * The screen belongs to one account twice over. It reads a timing record stored under that account,
 * and it holds the code the person typed, which is that account's credential. Both need the account
 * this tab holds, and this route is the one place that cannot simply ask for it.
 *
 * `/step-up` sits outside `(app)`, so nothing here starts the session monitor: `useHeldAccountId`
 * reports null for the whole life of a cold load, the record read comes back empty, and the person
 * lands back on Profile mid-challenge. `serverAccountId` is the proxy's answer, resolved from the
 * cookie it already validated to let this render happen at all, so the first paint names the
 * account. The held id takes precedence once it exists, because it is the one that moves.
 *
 * Starting the monitor here is what makes it move. It gives the route the cross-tab signal and the
 * poll every other route has, so a replacement reaches this screen as an account generation rise,
 * every field drops with it, and the record read returns the next account's answer, which is
 * nothing. That sends them to Profile rather than leaving a stranger's code and scheduled deletion
 * date on screen.
 */
export function StepUpScreen({ serverAccountId }: Readonly<{ serverAccountId: string | null }>) {
  const heldAccountId = useHeldAccountId()
  const sessionInactive = useAuthStore((state) => state.sessionInactive)
  const accountId = sessionInactive ? null : heldAccountId ?? serverAccountId

  useEffect(() => {
    const stopMonitor = useAuthStore.getState().startExpiryMonitor()
    return stopMonitor
  }, [])

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
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useAccountScopedState<StepUpPhase>('challenge')
  const [code, setCode] = useAccountScopedState('')
  const [attemptsRemaining, setAttemptsRemaining] = useAccountScopedState<number | null>(null)
  const [fieldError, setFieldError] = useAccountScopedState<string | null>(null)
  const [requestError, setRequestError] = useAccountScopedState<string | null>(null)
  const [requesting, setRequesting] = useAccountScopedState(false)
  const [scheduledDeletionAt, setScheduledDeletionAt] = useAccountScopedState<string | null>(null)

  useEffect(() => {
    if (!clientReady) return
    if (sessionInactive) {
      router.replace('/login')
      return
    }
    if (!operation || !record) {
      router.replace('/profile')
    }
  }, [clientReady, operation, record, router, sessionInactive])

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
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
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
    if (!operation || !record || code.length !== STEP_UP_CODE_LENGTH || checking || accountId === null) return
    const intendedAccountId = accountId
    const accountGeneration = getAccountGeneration()

    setPhase('checking')
    setFieldError(null)
    setRequestError(null)
    try {
      if (operation === 'keys') {
        const result = await confirmApiKeyCreationChallenge(code, intendedAccountId)
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
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
        router.replace('/profile')
        return
      }
      const result = await confirmDeletion(code, intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
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

  function handleCodeChange(value: string) {
    setCode(value)
    setFieldError(null)
    setAttemptsRemaining(null)
    if (phase === 'wrong') setPhase('challenge')
  }

  const otpError = getOtpError(t, fieldError, attemptsRemaining)

  if (!clientReady || sessionInactive || !operation || !record) return null

  const sharedView = { operationLabel, t }
  if (success) {
    return (
      <StepUpSuccess
        {...sharedView}
        deletionDate={formattedDeletionDate}
        showProNotice={Boolean(profile?.hasProAccess)}
        onSignOut={() => void logout()}
      />
    )
  }
  if (exhausted) {
    return (
      <StepUpExhausted
        {...sharedView}
        lockSeconds={lockSeconds}
        onBack={() => router.replace('/profile')}
      />
    )
  }
  return (
    <StepUpChallenge
      {...sharedView}
      checking={checking}
      code={code}
      cooldownSeconds={cooldownSeconds}
      email={email}
      expired={expired}
      onCancel={() => router.replace('/profile')}
      onCodeChange={handleCodeChange}
      onConfirm={() => void handleConfirm()}
      onResend={() => void handleResend()}
      otpError={otpError}
      requestError={requestError}
      requesting={requesting}
    />
  )
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

function StepUpHeader({
  body,
  operationLabel,
  t,
  title,
}: Readonly<SharedStepUpViewProps & { body?: string; title: string }>) {
  return (
    <header className="flex flex-col" style={{ gap: 8 }}>
      <p style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {t('eyebrow', { operation: operationLabel })}
      </p>
      <h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        {title}
      </h1>
      {body ? <p style={{ color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.55 }}>{body}</p> : null}
    </header>
  )
}

function StepUpSuccess({
  deletionDate,
  onSignOut,
  operationLabel,
  showProNotice,
  t,
}: Readonly<SharedStepUpViewProps & {
  deletionDate: string
  onSignOut: () => void
  showProNotice: boolean
}>) {
  return (
    <FlowShell nav={false} action={
      <PillButton onClick={onSignOut}>{t('signOut')}</PillButton>
    }>
      <StepUpHeader operationLabel={operationLabel} t={t} title={t('successTitle', { date: deletionDate })} />
      <div className="flex flex-col" style={{ gap: 16 }}>
        <p role="status" style={{ color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.55 }}>{t('successBody')}</p>
        {showProNotice ? <p style={{ color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.55 }}>{t('successPro', { date: deletionDate })}</p> : null}
      </div>
    </FlowShell>
  )
}

function StepUpExhausted({
  lockSeconds,
  onBack,
  operationLabel,
  t,
}: Readonly<SharedStepUpViewProps & { lockSeconds: number | null; onBack: () => void }>) {
  return (
    <FlowShell nav={false}>
      <StepUpHeader body={t('exhaustedBody')} operationLabel={operationLabel} t={t} title={t('exhaustedTitle')} />
      <div className="flex flex-col items-start" style={{ gap: 12 }}>
        <CapacityNotice message={t('exhaustedNotice')} />
        {lockSeconds === null ? null : (
          <p data-lock-countdown="" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
            {t('lockCountdown', { time: formatStepUpCountdown(lockSeconds) })}
          </p>
        )}
        <QuietLink onClick={onBack}>{t('backToProfile')}</QuietLink>
      </div>
      <p style={{ color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.55 }}>{t('neverShare')}</p>
    </FlowShell>
  )
}

interface StepUpChallengeProps extends SharedStepUpViewProps {
  checking: boolean
  code: string
  cooldownSeconds: number
  email: string
  expired: boolean
  onCancel: () => void
  onCodeChange: (value: string) => void
  onConfirm: () => void
  onResend: () => void
  otpError?: string
  requestError: string | null
  requesting: boolean
}

function StepUpChallenge(props: Readonly<StepUpChallengeProps>) {
  const { checking, code, cooldownSeconds, email, expired, onCancel, onCodeChange, onConfirm, onResend, operationLabel, otpError, requestError, requesting, t } = props
  const action = expired ? (
    <PillButton loading={requesting} onClick={onResend}>{t('resend')}</PillButton>
  ) : (
    <PillButton disabled={code.length !== STEP_UP_CODE_LENGTH} loading={checking} onClick={onConfirm}>{t('confirm')}</PillButton>
  )
  return (
    <FlowShell nav={false} action={action}>
      <StepUpHeader body={expired ? t('expiredBody') : t('body', { email })} operationLabel={operationLabel} t={t} title={expired ? t('expiredTitle') : t('title')} />
      <OtpInput id="step-up-code" value={code} onChange={onCodeChange} error={otpError} hint={expired ? undefined : t('codeHint')} disabled={checking || expired} autoFocus={!expired} label={t('codeLabel')} />
      {!expired ? <StepUpResend cooldownSeconds={cooldownSeconds} onResend={onResend} requesting={requesting} t={t} /> : null}
      {requestError ? <p role="alert" style={{ color: 'var(--status-bad-text)' }}>{requestError}</p> : null}
      <div className="flex flex-col items-start" style={{ gap: 8, paddingTop: 8 }}>
        <p style={{ color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.55 }}>{t('neverShare')}</p>
        <QuietLink onClick={onCancel}>{t('cancel')}</QuietLink>
      </div>
    </FlowShell>
  )
}

function StepUpResend({ cooldownSeconds, onResend, requesting, t }: Readonly<{
  cooldownSeconds: number
  onResend: () => void
  requesting: boolean
  t: StepUpTranslator
}>) {
  return (
    <div className="flex flex-col items-start" style={{ gap: 8 }}>
      {cooldownSeconds > 0 ? (
        <p data-resend-countdown="" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
          {t('cooldown', { time: formatStepUpCountdown(cooldownSeconds) })}
        </p>
      ) : (
        <PillButton variant="ghost" size="sm" loading={requesting} onClick={onResend}>{t('resend')}</PillButton>
      )}
    </div>
  )
}
