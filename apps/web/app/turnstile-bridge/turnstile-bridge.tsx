'use client'

import { useCallback } from 'react'
import { neutralColors } from '@orbit/shared/theme'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

export function TurnstileBridge({ siteKey, theme = 'dark' }: Readonly<{ siteKey: string; theme?: 'light' | 'dark' }>) {
  const postState = useCallback((state: string) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ state }))
  }, [])
  const postToken = useCallback((token: string | null) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ token }))
  }, [])

  return <div style={{ ...resolveWebThemeVariables('purple', theme), minHeight: '100vh',
    backgroundColor: neutralColors[theme].bg, colorScheme: theme }}>
    <TurnstileWidget siteKey={siteKey} theme={theme} resetKey={0} onToken={postToken} onStateChange={postState} />
  </div>
}
