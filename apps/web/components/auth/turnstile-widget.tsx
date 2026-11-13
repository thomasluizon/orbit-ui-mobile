'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useEffect, useRef, useState, type Ref } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useCurrentTheme } from '@/stores/theme-store'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    appearance: 'interaction-only'
    size: 'flexible'
    theme: 'light' | 'dark'
    language: string
    callback: (token: string) => void
    'error-callback': () => boolean
    'expired-callback': () => void
    'before-interactive-callback': () => void
    'after-interactive-callback': () => void
  }) => unknown
  reset: (widgetId: unknown) => void
  remove: (widgetId: unknown) => void
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

function useChallengeVisibility() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [challengeVisible, setChallengeVisible] = useState(false)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setChallengeVisible(container.getBoundingClientRect().height > 0)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  return { containerRef, challengeVisible }
}

export function TurnstileWidget({
  ref,
  siteKey,
  resetKey,
  onToken,
  onStateChange,
  theme,
  language,
  quiet = false,
}: Readonly<{
  ref?: Ref<HTMLDivElement>
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onStateChange?: (state: WidgetState) => void
  theme?: 'light' | 'dark'
  language?: string
  quiet?: boolean
}>) {
  const t = useTranslations()
  const appLocale = useLocale()
  // WHY: Cloudflare lists Orbit's pt-BR as pt-br https://developers.cloudflare.com/turnstile/reference/supported-languages/
  const challengeLanguage = (language ?? appLocale).toLowerCase()
  const currentTheme = useCurrentTheme()
  const challengeTheme = theme ?? currentTheme
  const { containerRef, challengeVisible } = useChallengeVisibility()
  const widgetIdRef = useRef<unknown>(null)
  const callbacksRef = useRef({ onToken, onStateChange })
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    callbacksRef.current = { onToken, onStateChange }
  }, [onToken, onStateChange])

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
      callbacksRef.current.onStateChange?.(next)
      callbacksRef.current.onToken(token)
    }

    function renderWidget() {
      const turnstile = getTurnstile()
      if (!turnstile || !container || !active) return
      widgetIdRef.current = turnstile.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        theme: challengeTheme,
        language: challengeLanguage,
        callback: (token) => update('solved', token),
        'error-callback': () => {
          update('failed')
          return true
        },
        'expired-callback': () => update('expired'),
        'before-interactive-callback': () => update('interactive'),
        'after-interactive-callback': () => update('loading'),
      })
    }

    void loadTurnstile().then(renderWidget, () => update('failed'))

    return () => {
      active = false
      const widgetId = widgetIdRef.current
      if (widgetId != null) getTurnstile()?.remove(widgetId)
      widgetIdRef.current = null
    }
  }, [containerRef, siteKey, challengeTheme, challengeLanguage, attempt])

  useEffect(() => {
    if (resetKey === 0) return
    const widgetId = widgetIdRef.current
    if (widgetId != null) getTurnstile()?.reset(widgetId)
  }, [resetKey])

  function retry() {
    onToken(null)
    setState('loading')
    onStateChange?.('loading')
    const widgetId = widgetIdRef.current
    if (widgetId != null) {
      getTurnstile()?.reset(widgetId)
    } else {
      setAttempt((value) => value + 1)
    }
  }

  const statusVisible = !quiet && (state === 'loading' || state === 'failed' || state === 'expired')
  const position = challengeVisible || statusVisible ? undefined : 'absolute'
  // WHY: Cloudflare documents no success state for interaction-only, so the form hides the passed widget itself https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
  const challengeStyle = state === 'solved' ? { display: 'none' } : undefined
  if (quiet) return <div ref={containerRef} style={{ position, ...challengeStyle }} />

  return (
    <div ref={ref} className="flex flex-col items-center text-center text-sm text-[var(--fg-2)]" style={{ gap: 8, position }}>
      <div ref={containerRef} className="w-full" style={challengeStyle} />
      <p role="status" className={state === 'loading' ? '' : 'sr-only'}>
        {state === 'loading' ? t('auth.turnstileLoading') : ''}
      </p>
      <p role="alert" className={`text-[var(--status-bad-text)] ${state === 'failed' || state === 'expired' ? '' : 'sr-only'}`}>
        {state === 'failed' || state === 'expired'
          ? t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired') : ''}
      </p>
      {(state === 'failed' || state === 'expired') &&
        <IconButton label={t('auth.turnstileRetry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
    </div>
  )
}
