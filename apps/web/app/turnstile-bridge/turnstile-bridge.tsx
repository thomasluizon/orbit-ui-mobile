'use client'

import { useCallback } from 'react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

export function TurnstileBridge({ siteKey }: Readonly<{ siteKey: string }>) {
  const postState = useCallback((state: string) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ state }))
  }, [])
  const postToken = useCallback((token: string | null) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ token }))
  }, [])

  return <TurnstileWidget siteKey={siteKey} resetKey={0} onToken={postToken} onStateChange={postState} />
}
