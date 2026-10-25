import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { completeAppleHandoff } from '@/lib/apple-auth'
import { clearStoredAuthReturnUrl, clearStoredReferralCode, getSafeReturnUrl, getStoredAuthReturnUrl, isAuthReturnUrlAttemptCurrent } from '@/lib/auth-flow'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'
import { LoginContent } from './login-content'

export function AppleAuthCallback() {
  const params = useLocalSearchParams<{ handoff?: string; state?: string }>()
  const router = useRouter()
  const login = useAuthStore((session) => session.login)
  const isLoading = useAuthStore((session) => session.isLoading)
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState<{ response: BackendLoginResponse; attemptId: string; epoch: number } | null>(null)
  const callbackIdentity = JSON.stringify([params.state, params.handoff])
  const processed = useRef<string | null>(null)
  const [outcomeIdentity, setOutcomeIdentity] = useState(callbackIdentity)
  if (outcomeIdentity !== callbackIdentity) {
    setOutcomeIdentity(callbackIdentity)
    setState('pending')
    setAccount(null)
    setLoading(false)
  }

  async function finish(owner: { response: BackendLoginResponse; attemptId: string; epoch: number }, isCurrentCallback: () => boolean) {
    const { response, attemptId, epoch } = owner
    const currentAttempt = () => isCurrentCallback() && isAuthReturnUrlAttemptCurrent(attemptId)
    if (!currentAttempt() || epoch !== getSessionGeneration().epoch) return
    const currentSession = await login(response.token, response.refreshToken, {
      userId: response.userId, name: response.name, email: response.email,
    }, epoch, currentAttempt)
    if (!currentSession?.() || !currentAttempt()) return
    await clearStoredReferralCode()
    if (!currentSession() || !currentAttempt()) return
    const returnUrl = await getStoredAuthReturnUrl(attemptId)
    if (!currentSession() || !currentAttempt()) return
    await clearStoredAuthReturnUrl(attemptId, currentSession)
    if (currentSession() && currentAttempt()) router.replace(getSafeReturnUrl(returnUrl))
  }

  useEffect(() => {
    if (isLoading || processed.current === callbackIdentity) return
    processed.current = callbackIdentity
    const epoch = getSessionGeneration().epoch
    const isCurrentCallback = () => processed.current === callbackIdentity && epoch === getSessionGeneration().epoch
    async function complete() {
      if (typeof params.handoff !== 'string' || typeof params.state !== 'string') throw new Error('Invalid OAuth callback')
      const owner = await completeAppleHandoff(params.handoff, params.state)
      if (!isCurrentCallback()) return
      if (owner.response.wasReactivated) { setAccount(owner); setState('account'); return }
      await finish(owner, isCurrentCallback)
    }
    void complete().catch(() => { if (isCurrentCallback()) setState('failed') })
  })

  async function continueAccount() {
    if (!account || loading) return
    const isCurrentCallback = () => processed.current === callbackIdentity && account.epoch === getSessionGeneration().epoch
    setLoading(true)
    try { await finish(account, isCurrentCallback) } catch { if (isCurrentCallback()) setState('failed') }
    finally { if (isCurrentCallback()) setLoading(false) }
  }

  return <LoginContent key={callbackIdentity} callback={{ state, provider: 'apple', loading, onContinue: () => { void continueAccount() } }} />
}
