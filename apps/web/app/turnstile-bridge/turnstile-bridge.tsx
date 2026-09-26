'use client'

import { useCallback } from 'react'
import { neutralColors } from '@orbit/shared/theme'
import type { SupportedLocale } from '@orbit/shared/types'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

export function TurnstileBridge({ siteKey, theme = 'dark', language }: Readonly<{
  siteKey: string
  theme?: 'light' | 'dark'
  language?: SupportedLocale
}>) {
  const postState = useCallback((state: string) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ state }))
  }, [])
  const postToken = useCallback((token: string | null) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ token }))
  }, [])

  return <div style={{ ...resolveWebThemeVariables('purple', theme), minHeight: '100vh',
    backgroundColor: neutralColors[theme].bg, colorScheme: theme }}>
    <TurnstileWidget siteKey={siteKey} theme={theme} language={language} resetKey={0} onToken={postToken} onStateChange={postState} />
  </div>
}
