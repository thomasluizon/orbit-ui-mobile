'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  STEP_UP_CODE_LENGTH,
  extractBackendError,
  extractBackendErrorCode,
  extractStepUpAttemptsRemaining,
  formatStepUpCountdown,
  getStepUpCooldownSeconds,
  getStepUpLockSeconds,
  getStepUpPhaseFromTiming,
  isStepUpOperation,
  type StepUpPhase,
  type StepUpTimingRecord,
} from '@orbit/shared/utils'
import { Providers } from '@/lib/providers'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useAuthStore } from '@/stores/auth-store'
import {
  confirmApiKeyCreationChallenge,
  requestApiKeyCreationChallenge,
} from '@/app/actions/api-keys'
import { confirmDeletion, requestDeletion } from '@/app/actions/auth'
import {
  beginStepUpChallenge,
  clearStepUpTiming,
  markStepUpExhausted,
  readStepUpTiming,
} from '@/lib/step-up-storage'
import { FlowShell } from '@/components/shell/flow-shell'
import { OtpInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { CapacityNotice } from '@/components/ui/capacity-notice'

export default function StepUpPage() {
  return (
    <Providers>
      <StepUpScreen />
    </Providers>
  )
}

const subscribeClientReady = () => () => {}
const getClientReady = () => true
const getServerNotReady = () => false

export function StepUpScreen() {
  const t = useTranslations('stepUp')
  const router = useRouter()
  const searchParams = useSearchParams()
  const operationParam = searchParams.get('operation')
  const operation = isStepUpOperation(operationParam) ? operationParam : null
  const { profile } = useProfile()
  const userEmail = useAuthStore((state) => state.user?.email)
  const logout = useAuthStore((state) => state.logout)
  const { displayDate } = useDateFormat()

  const [recordOverride, setRecord] = useState<StepUpTimingRecord | null>(null)
  const clientReady = useSyncExternalStore(
    subscribeClientReady,
    getClientReady,
    getServerNotReady,
  )
  const storedRecord = clientReady && operation ? readStepUpTiming(operation) : null
  const record = recordOverride ?? storedRecord
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<StepUpPhase>('challenge')
  const [code, setCode] = useState('')
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [scheduledDeletionAt, setScheduledDeletionAt] = useState<string | null>(null)

  useEffect(() => {
    if (!clientReady) return
    if (!operation || !record) {
      router.replace('/profile')
    }
  }, [clientReady, operation, record, router])

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

  async function handleResend() {
    if (!operation || exhausted || requesting) return
    setRequesting(true)
    setRequestError(null)
    try {
      if (operation === 'delete') await requestDeletion()
      else await requestApiKeyCreationChallenge()
      const next = beginStepUpChallenge(operation)
      setRecord(next)
      setCode('')
      setAttemptsRemaining(null)
      setFieldError(null)
      setPhase(getStepUpPhaseFromTiming(next, Date.now()))
      setNow(Date.now())
    } catch {
      setRequestError(t('requestError'))
    } finally {
      setRequesting(false)
    }
  }

  async function handleConfirm() {
    if (!operation || !record || code.length !== STEP_UP_CODE_LENGTH || checking) return
    setPhase('checking')
    setFieldError(null)
    setRequestError(null)
    try {
      if (operation === 'keys') {
        await confirmApiKeyCreationChallenge(code)
        clearStepUpTiming(operation)
        router.replace('/advanced?create-key=1')
        return
      }
      const response = await confirmDeletion(code)
      setRecord(record)
      clearStepUpTiming(operation)
      setScheduledDeletionAt(response.scheduledDeletionAt)
      setPhase('deactivated')
    } catch (caught: unknown) {
      const errorCode = extractBackendErrorCode(caught)
      const backendMessage = extractBackendError(caught)
      const remaining = extractStepUpAttemptsRemaining(backendMessage)

      if (errorCode === 'TOO_MANY_ATTEMPTS' || remaining === 0) {
        const next = markStepUpExhausted(record)
        setRecord(next)
        setPhase('exhausted')
        setNow(Date.now())
        return
      }
      if (errorCode === 'CODE_EXPIRED') {
        setPhase('expired')
        return
      }
      if (errorCode === 'INVALID_VERIFICATION_CODE') {
        setAttemptsRemaining(remaining)
        setFieldError(t('wrong'))
        setPhase('wrong')
        return
      }
      setFieldError(t('genericError'))
      setPhase('challenge')
    }
  }

  function handleCodeChange(value: string) {
    setCode(value)
    setFieldError(null)
    setAttemptsRemaining(null)
    if (phase === 'wrong') setPhase('challenge')
  }

  const otpError = getOtpError(t, fieldError, attemptsRemaining)

  if (!clientReady || !operation || !record) return null

  const sharedView = { operationLabel, t }
  if (success) {
    return (
      <StepUpSuccess
        {...sharedView}
        deletionDate={formattedDeletionDate}
        planEndDate={profile?.hasProAccess && profile.planExpiresAt
          ? displayDate(profile.planExpiresAt)
          : null}
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
  planEndDate,
  t,
}: Readonly<SharedStepUpViewProps & {
  deletionDate: string
  onSignOut: () => void
  planEndDate: string | null
}>) {
  return (
    <FlowShell nav={false} action={<PillButton onClick={onSignOut}>{t('signOut')}</PillButton>}>
      <StepUpHeader operationLabel={operationLabel} t={t} title={t('successTitle', { date: deletionDate })} />
      <div className="flex flex-col" style={{ gap: 16 }}>
        <p role="status" style={{ color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.55 }}>{t('successBody')}</p>
        {planEndDate ? <p style={{ color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.55 }}>{t('successPro', { date: planEndDate })}</p> : null}
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
