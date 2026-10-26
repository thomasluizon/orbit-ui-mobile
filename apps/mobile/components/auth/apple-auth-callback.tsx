import { useEffect, useRef, useState } from 'react'
import { captureMessage } from '@sentry/react-native'
import { AuthCallbackError, createAuthCallbackFailureReporter, readAuthCallbackInput, type AuthCallbackFailureReason } from '@orbit/shared/utils/auth-callback-failure'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { completeAppleHandoff } from '@/lib/apple-auth'
import { clearStoredAuthReturnUrl, clearStoredReferralCode, getSafeReturnUrl, getStoredAuthReturnUrl, isAuthReturnUrlAttemptCurrent } from '@/lib/auth-flow'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'
import { LoginContent } from './login-content'

export function AppleAuthCallback() {
  const params = useLocalSearchParams<{ handoff?: string; state?: string; error?: string }>()
  const router = useRouter()
  const login = useAuthStore((session) => session.login)
  const isLoading = useAuthStore((session) => session.isLoading)
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState<{ response: BackendLoginResponse; attemptId: string; epoch: number } | null>(null)
  const callbackIdentity = JSON.stringify([params.state, params.handoff, params.error])
  const processed = useRef<string | null>(null)
  const [outcome, setOutcome] = useState(() => ({ identity: callbackIdentity,
    reportFailure: createAuthCallbackFailureReporter('apple', captureMessage) }))
  const { reportFailure } = outcome
  if (outcome.identity !== callbackIdentity) {
    setOutcome({ identity: callbackIdentity, reportFailure: createAuthCallbackFailureReporter('apple', captureMessage) })
    setState('pending')
    setAccount(null)
    setLoading(false)
  }

  async function finish(owner: { response: BackendLoginResponse; attemptId: string; epoch: number }, isCurrentCallback: () => boolean) {
    const { response, attemptId, epoch } = owner
    const currentAttempt = () => isCurrentCallback() && isAuthReturnUrlAttemptCurrent(attemptId)
    if (!currentAttempt() || epoch !== getSessionGeneration().epoch) { reportFailure('session_changed'); return }
    const currentSession = await login(response.token, response.refreshToken, {
      userId: response.userId, name: response.name, email: response.email,
    }, epoch, currentAttempt)
    if (!currentSession) { reportFailure('session_changed'); return }
    const ownsOutcome = () => currentSession() && currentAttempt()
    if (!ownsOutcome()) { reportFailure('session_changed'); return }
    await clearStoredReferralCode()
    if (!ownsOutcome()) { reportFailure('session_changed'); return }
    const returnUrl = await getStoredAuthReturnUrl(attemptId)
    if (!ownsOutcome()) { reportFailure('session_changed'); return }
    await clearStoredAuthReturnUrl(attemptId, ownsOutcome)
    if (!ownsOutcome()) { reportFailure('session_changed'); return }
    router.replace(getSafeReturnUrl(returnUrl))
  }

  useEffect(() => {
    if (isLoading || processed.current === callbackIdentity) return
    processed.current = callbackIdentity
    const epoch = getSessionGeneration().epoch
    const isCurrentCallback = () => processed.current === callbackIdentity
    const isCurrentExchange = () => isCurrentCallback() && epoch === getSessionGeneration().epoch
    let failureReason: AuthCallbackFailureReason = 'exchange_failed'
    async function complete() {
      const input = readAuthCallbackInput(Boolean(params.error), params.handoff, params.state)
      if (input.reason) throw new AuthCallbackError(input.reason)
      const owner = await completeAppleHandoff(input.code, input.state)
      if (!isCurrentExchange()) { reportFailure('session_changed'); return }
      if (owner.response.wasReactivated) { setAccount(owner); setState('account'); return }
      failureReason = 'profile_hydration_failed'
      await finish(owner, isCurrentCallback)
    }
    void complete().catch((error: unknown) => {
      if (!isCurrentCallback()) return
      reportFailure(error instanceof AuthCallbackError ? error.reason : failureReason)
      if (isCurrentExchange()) setState('failed')
    })
  })

  async function continueAccount() {
    if (!account || loading) return
    const isCurrentCallback = () => processed.current === callbackIdentity
    setLoading(true)
    try { await finish(account, isCurrentCallback) }
    catch {
      if (isCurrentCallback() && account.epoch === getSessionGeneration().epoch) {
        reportFailure('profile_hydration_failed'); setState('failed')
      }
    }
    finally { if (isCurrentCallback()) setLoading(false) }
  }

  return <LoginContent key={callbackIdentity} callback={{ state, provider: 'apple', loading, onContinue: () => { void continueAccount() } }} />
}
