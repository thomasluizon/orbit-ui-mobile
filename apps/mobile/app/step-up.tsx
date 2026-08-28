import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
  readStepUpTiming,
} from '@/lib/step-up-storage'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useLogout } from '@/hooks/use-logout'
import { useAuthStore } from '@/stores/auth-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { FlowShell } from '@/components/shell/flow-shell'
import { OtpInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
import { CapacityNotice } from '@/components/ui/capacity-notice'

export default function StepUpScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ operation?: string | string[] }>()
  const operationValue = Array.isArray(params.operation)
    ? params.operation[0]
    : params.operation
  const operation = isStepUpOperation(operationValue) ? operationValue : null
  const { profile } = useProfile()
  const userEmail = useAuthStore((state) => state.user?.email)
  const logout = useLogout()
  const { displayDate } = useDateFormat()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [record, setRecord] = useState<StepUpTimingRecord | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<StepUpPhase>('challenge')
  const [code, setCode] = useState('')
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [scheduledDeletionAt, setScheduledDeletionAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function hydrate() {
      if (!operation) {
        router.replace('/profile')
        return
      }
      const stored = await readStepUpTiming(operation)
      if (!active) return
      if (!stored) {
        router.replace('/profile')
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
  }, [operation, router])

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
    if (!operation || exhausted || requesting) return
    setRequesting(true)
    setRequestError(null)
    try {
      await requestChallenge()
      const next = await beginStepUpChallenge(operation)
      setRecord(next)
      setCode('')
      setAttemptsRemaining(null)
      setFieldError(null)
      setPhase(getStepUpPhaseFromTiming(next, Date.now()))
      setNow(Date.now())
    } catch {
      setRequestError(t('stepUp.requestError'))
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
        await apiClient(
          API.apiKeys.confirmCreationChallenge,
          { method: 'POST', body: JSON.stringify({ code }) },
          stepUpMessageResponseSchema,
        )
        await clearStepUpTiming(operation)
        router.replace('/advanced?create-key=1')
        return
      }
      const response = await apiClient<AccountDeactivationResponse>(
        API.auth.confirmDeletion,
        { method: 'POST', body: JSON.stringify({ code }) },
        accountDeactivationResponseSchema,
      )
      await clearStepUpTiming(operation)
      setScheduledDeletionAt(response.scheduledDeletionAt)
      setPhase('deactivated')
    } catch (caught: unknown) {
      await handleConfirmationFailure(caught)
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
      ? await markStepUpAttemptFailed(record)
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
    const next = await markStepUpExhausted(currentRecord)
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

  const otpError = getMobileOtpError(t, fieldError, attemptsRemaining)

  if (!hydrated || !operation || !record) return null
  const sharedView = { operationLabel, t, tokens }
  if (success) {
    return (
      <MobileStepUpSuccess
        {...sharedView}
        deletionDate={formattedDeletionDate}
        onSignOut={() => void logout()}
        showProNotice={Boolean(profile?.hasProAccess)}
      />
    )
  }
  if (exhausted) {
    return (
      <MobileStepUpExhausted
        {...sharedView}
        lockSeconds={lockSeconds}
        onBack={() => router.replace('/profile')}
      />
    )
  }
  return (
    <MobileStepUpChallenge
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

function MobileStepUpHeader({
  body,
  operationLabel,
  t,
  title,
  tokens,
}: Readonly<SharedMobileStepUpProps & { body?: string; title: string }>) {
  return (
    <View style={styles.header}>
      <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>{t('stepUp.eyebrow', { operation: operationLabel })}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: tokens.fg2 }]}>{body}</Text> : null}
    </View>
  )
}

function MobileStepUpSuccess({
  deletionDate,
  onSignOut,
  operationLabel,
  showProNotice,
  t,
  tokens,
}: Readonly<SharedMobileStepUpProps & {
  deletionDate: string
  onSignOut: () => void
  showProNotice: boolean
}>) {
  return (
    <FlowShell nav={false} action={<PillButton onClick={onSignOut}>{t('stepUp.signOut')}</PillButton>}>
      <View style={styles.column}>
        <MobileStepUpHeader operationLabel={operationLabel} t={t} title={t('stepUp.successTitle', { date: deletionDate })} tokens={tokens} />
        <View style={styles.success}>
          <Text accessibilityRole="summary" style={[styles.body, { color: tokens.fg2 }]}>{t('stepUp.successBody')}</Text>
          {showProNotice ? <Text style={[styles.secondary, { color: tokens.fg3 }]}>{t('stepUp.successPro', { date: deletionDate })}</Text> : null}
        </View>
      </View>
    </FlowShell>
  )
}

function MobileStepUpExhausted({
  lockSeconds,
  onBack,
  operationLabel,
  t,
  tokens,
}: Readonly<SharedMobileStepUpProps & { lockSeconds: number | null; onBack: () => void }>) {
  return (
    <FlowShell nav={false}>
      <View style={styles.column}>
        <MobileStepUpHeader body={t('stepUp.exhaustedBody')} operationLabel={operationLabel} t={t} title={t('stepUp.exhaustedTitle')} tokens={tokens} />
        <View style={styles.exhausted}>
          <CapacityNotice message={t('stepUp.exhaustedNotice')} />
          {lockSeconds === null ? null : <Text testID="lock-countdown" style={[styles.mono, { color: tokens.fg3 }]}>{t('stepUp.lockCountdown', { time: formatStepUpCountdown(lockSeconds) })}</Text>}
          <QuietAction label={t('stepUp.backToProfile')} onPress={onBack} />
        </View>
        <Text style={[styles.secondary, { color: tokens.fg3 }]}>{t('stepUp.neverShare')}</Text>
      </View>
    </FlowShell>
  )
}

interface MobileStepUpChallengeProps extends SharedMobileStepUpProps {
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

function MobileStepUpChallenge(props: Readonly<MobileStepUpChallengeProps>) {
  const { checking, code, cooldownSeconds, email, expired, onCancel, onCodeChange, onConfirm, onResend, operationLabel, otpError, requestError, requesting, t, tokens } = props
  const action = expired ? (
    <PillButton loading={requesting} onClick={onResend}>{t('stepUp.resend')}</PillButton>
  ) : (
    <PillButton disabled={code.length !== STEP_UP_CODE_LENGTH} loading={checking} onClick={onConfirm}>{t('stepUp.confirm')}</PillButton>
  )
  return (
    <FlowShell nav={false} action={action}>
      <View style={styles.column}>
        <MobileStepUpHeader body={expired ? t('stepUp.expiredBody') : t('stepUp.body', { email })} operationLabel={operationLabel} t={t} title={expired ? t('stepUp.expiredTitle') : t('stepUp.title')} tokens={tokens} />
        <OtpInput value={code} onChange={onCodeChange} error={otpError} hint={expired ? undefined : t('stepUp.codeHint')} disabled={checking || expired} autoFocus={!expired} label={t('stepUp.codeLabel')} />
        {!expired ? <MobileStepUpResend cooldownSeconds={cooldownSeconds} onResend={onResend} requesting={requesting} t={t} tokens={tokens} /> : null}
        {requestError ? <Text accessibilityRole="alert" style={[styles.secondary, { color: tokens.statusBadText }]}>{requestError}</Text> : null}
        <View style={styles.note}>
          <Text style={[styles.secondary, { color: tokens.fg3 }]}>{t('stepUp.neverShare')}</Text>
          <QuietAction label={t('stepUp.cancel')} onPress={onCancel} />
        </View>
      </View>
    </FlowShell>
  )
}

function MobileStepUpResend({ cooldownSeconds, onResend, requesting, t, tokens }: Readonly<{
  cooldownSeconds: number
  onResend: () => void
  requesting: boolean
  t: TFunction
  tokens: StepUpTokens
}>) {
  return (
    <View style={styles.resendRow}>
      {cooldownSeconds > 0 ? (
        <Text testID="resend-countdown" style={[styles.mono, { color: tokens.fg3 }]}>{t('stepUp.cooldown', { time: formatStepUpCountdown(cooldownSeconds) })}</Text>
      ) : (
        <PillButton variant="ghost" size="sm" loading={requesting} onClick={onResend}>{t('stepUp.resend')}</PillButton>
      )}
    </View>
  )
}

function QuietAction({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quietAction, pressed ? styles.quietPressed : null]}
    >
      <Text style={[styles.quietLabel, { color: tokens.fg2 }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  column: {
    gap: 24,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 12,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 22,
    letterSpacing: -0.44,
    lineHeight: 27,
  },
  body: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 25,
  },
  secondary: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  mono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },
  resendRow: {
    alignItems: 'flex-start',
    gap: 8,
  },
  exhausted: {
    alignItems: 'flex-start',
    gap: 12,
  },
  success: {
    gap: 16,
  },
  note: {
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 8,
  },
  quietAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  quietPressed: {
    opacity: 0.75,
  },
  quietLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
})
