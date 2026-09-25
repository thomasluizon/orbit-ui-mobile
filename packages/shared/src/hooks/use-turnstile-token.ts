import { useCallback, useEffect, useRef, useState } from 'react'

interface TurnstileTokenState {
  token: string | null
  resetKey: number
  onToken: (token: string | null) => void
  takeToken: () => { turnstileToken?: string } | null
}

export function useTurnstileToken(siteKey: string | undefined, isOnline: boolean): TurnstileTokenState {
  const [token, setToken] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const [resetKey, setResetKey] = useState(0)

  const onToken = useCallback((nextToken: string | null) => {
    tokenRef.current = nextToken
    setToken(nextToken)
  }, [])

  useEffect(() => {
    if (!isOnline) void Promise.resolve().then(() => onToken(null))
  }, [isOnline, onToken])

  function takeToken() {
    if (!siteKey) return {}
    const currentToken = tokenRef.current
    if (!currentToken) return null
    tokenRef.current = null
    setToken(null)
    setResetKey((value) => value + 1)
    return { turnstileToken: currentToken }
  }

  return { token, resetKey, onToken, takeToken }
}
