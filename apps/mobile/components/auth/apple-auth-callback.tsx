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
  const processed = useRef(false)

  async function finish(owner: { response: BackendLoginResponse; attemptId: string; epoch: number }) {
    const { response, attemptId, epoch } = owner
    const currentAttempt = () => isAuthReturnUrlAttemptCurrent(attemptId)
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
    if (isLoading || processed.current) return
    processed.current = true
    const epoch = getSessionGeneration().epoch
    async function complete() {
      if (typeof params.handoff !== 'string' || typeof params.state !== 'string') throw new Error('Invalid OAuth callback')
      const owner = await completeAppleHandoff(params.handoff, params.state)
      if (epoch !== getSessionGeneration().epoch) return
      if (owner.response.wasReactivated) { setAccount(owner); setState('account'); return }
      await finish(owner)
    }
    void complete().catch(() => { if (epoch === getSessionGeneration().epoch) setState('failed') })
  })

  async function continueAccount() {
    if (!account || loading) return
    setLoading(true)
    try { await finish(account) } catch { setState('failed') }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, provider: 'apple', loading, onContinue: () => { void continueAccount() } }} />
}
