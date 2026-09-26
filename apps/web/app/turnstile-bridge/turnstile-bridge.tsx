'use client'

import { useCallback } from 'react'
import type { SupportedLocale } from '@orbit/shared/types'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

export function TurnstileBridge({ siteKey, language }: Readonly<{ siteKey: string; language?: SupportedLocale }>) {
  const postState = useCallback((state: string) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ state }))
  }, [])
  const postToken = useCallback((token: string | null) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ token }))
  }, [])

  return <TurnstileWidget siteKey={siteKey} language={language} resetKey={0} onToken={postToken} onStateChange={postState} />
}
