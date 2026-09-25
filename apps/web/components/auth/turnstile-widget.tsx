'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

type WidgetState = 'idle' | 'loading' | 'solved' | 'failed' | 'expired'

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    appearance: 'interaction-only'
    size: 'compact'
    theme?: 'light' | 'dark'
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
  theme,
}: Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onStateChange?: (state: WidgetState) => void
  theme?: 'light' | 'dark'
}>) {
  const t = useTranslations()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    return () => { active = false }
  }, [resetKey])

  useEffect(() => {
    let active = true
    const container = containerRef.current
    if (!container) return

    function update(next: WidgetState, token: string | null = null) {
      if (!active) return
      setState(next)
      onStateChange?.(next)
      onToken(token)
    }

    function renderWidget() {
      const turnstile = getTurnstile()
      if (!turnstile || !container || !active) return
      widgetIdRef.current = turnstile.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'compact',
        ...(theme ? { theme } : {}),
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
  }, [siteKey, theme, attempt, onToken, onStateChange])

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
    <div className="flex flex-col items-center text-sm text-[var(--fg-2)]" style={{ gap: 8 }}>
      <div ref={containerRef} />
      <p role="status" className={state === 'loading' ? '' : 'sr-only'}>
        {state === 'loading' ? t('auth.turnstileLoading') : ''}
      </p>
      <p role="alert" className={`text-[var(--status-bad-text)] ${state === 'failed' || state === 'expired' ? '' : 'sr-only'}`}>
        {state === 'failed' || state === 'expired'
          ? t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired') : ''}
      </p>
      {(state === 'failed' || state === 'expired') &&
        <PillButton variant="ghost" size="sm" onClick={retry}>{t('auth.turnstileRetry')}</PillButton>}
    </div>
  )
}
