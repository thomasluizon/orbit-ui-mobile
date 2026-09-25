'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

type WidgetState = 'loading' | 'solved' | 'failed' | 'expired'

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    appearance: 'interaction-only'
    size: 'compact'
    callback: (token: string) => void
    'error-callback': () => boolean
    'expired-callback': () => void
  }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile
}

let turnstileLoad: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = getTurnstile()
  if (existing) return Promise.resolve(existing)
  if (turnstileLoad) return turnstileLoad

  turnstileLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? ''
    script.onload = () => {
      const api = getTurnstile()
      if (api) resolve(api)
      else reject(new Error('Turnstile script did not initialize'))
    }
    script.onerror = () => reject(new Error('Turnstile script failed to load'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    turnstileLoad = null
    document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]')?.remove()
    throw error
  })
  return turnstileLoad
}

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onStateChange,
}: Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onStateChange?: (state: WidgetState) => void
}>) {
  const t = useTranslations()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onToken, onStateChange })
  const [state, setState] = useState<WidgetState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    callbacksRef.current = { onToken, onStateChange }
  }, [onToken, onStateChange])

  useEffect(() => {
    let active = true
    const container = containerRef.current
    if (!container) return

    function update(next: WidgetState, token: string | null = null) {
      if (!active) return
      setState(next)
      callbacksRef.current.onStateChange?.(next)
      callbacksRef.current.onToken(token)
    }

    function renderWidget() {
      const turnstile = getTurnstile()
      if (!turnstile || !container || !active) return
      widgetIdRef.current = turnstile.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'compact',
        callback: (token) => update('solved', token),
        'error-callback': () => {
          update('failed')
          return true
        },
        'expired-callback': () => update('expired'),
      })
    }

    void loadTurnstile().then(renderWidget, () => update('failed'))

    return () => {
      active = false
      const widgetId = widgetIdRef.current
      if (widgetId) getTurnstile()?.remove(widgetId)
      widgetIdRef.current = null
    }
  }, [siteKey, attempt])

  useEffect(() => {
    if (resetKey === 0) return
    const widgetId = widgetIdRef.current
    if (widgetId) getTurnstile()?.reset(widgetId)
  }, [resetKey])

  function retry() {
    onToken(null)
    setState('loading')
    onStateChange?.('loading')
    const widgetId = widgetIdRef.current
    if (widgetId) {
      getTurnstile()?.reset(widgetId)
    } else {
      setAttempt((value) => value + 1)
    }
  }

  return (
    <div className="flex flex-col items-center" style={{ gap: 8 }}>
      <div ref={containerRef} />
      {state === 'loading' && <p role="status">{t('auth.turnstileLoading')}</p>}
      {(state === 'failed' || state === 'expired') && (
        <div className="flex items-center" style={{ gap: 8 }}>
          <p role="alert">{t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired')}</p>
          <button type="button" onClick={retry}>{t('auth.turnstileRetry')}</button>
        </div>
      )}
    </div>
  )
}
