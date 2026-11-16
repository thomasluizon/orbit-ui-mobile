'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { useCurrentTheme } from '@/stores/theme-store'
import { SkeletonFace } from '@/components/ui/skeleton'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

type ChallengeProps = Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onStateChange?: (state: WidgetState) => void
}>

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    appearance: 'interaction-only'
    size: 'flexible'
    theme: 'light' | 'dark'
    language: string
    retry: 'never'
    callback: (token: string) => void
    'error-callback': (code: string) => boolean
    'expired-callback': () => void
    'before-interactive-callback': () => void
    'after-interactive-callback': () => void
  }) => unknown
  reset: (widgetId: unknown) => void
  remove: (widgetId: unknown) => void
}

// WHY: Cloudflare marks these codes Retry: Yes, but api.js with retry auto skips its retry for 200500 and during a reset, so the widget runs them again itself https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
const RETRIED_ERROR_CODES = new Set(['110600', '110620', '200500'])
const RETRIED_ERROR_FAMILIES = ['300', '600']
const MAX_AUTOMATIC_RETRIES = 2
// WHY: Cloudflare sizes the flexible widget at 100% width and 65px height, so the wait holds the same box https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65

function isRetriedFailure(code: string): boolean {
  return RETRIED_ERROR_CODES.has(code) || RETRIED_ERROR_FAMILIES.some((family) => code.startsWith(family))
}

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile
}

let turnstileLoad: Readonly<{ promise: Promise<TurnstileApi>; script: HTMLScriptElement }> | null = null

function forgetTurnstileLoad(script: HTMLScriptElement) {
  script.remove()
  if (turnstileLoad?.script === script) turnstileLoad = null
}

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = getTurnstile()
  if (existing) return Promise.resolve(existing)
  if (turnstileLoad) return turnstileLoad.promise

  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true
  script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? ''
  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    script.onload = () => {
      const api = getTurnstile()
      if (api) resolve(api)
      else reject(new Error('Turnstile script did not initialize'))
    }
    script.onerror = () => reject(new Error('Turnstile script failed to load'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    forgetTurnstileLoad(script)
    throw error
  })
  turnstileLoad = { promise, script }
  return promise
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

function useTurnstileScript({ onLoadState }: Readonly<{ onLoadState: (state: 'loading' | 'failed') => void }>) {
  const [loaded, setLoaded] = useState<Readonly<{ turnstile: TurnstileApi }> | null>(null)
  const [load, setLoad] = useState(0)
  const onLoadStateRef = useRef(onLoadState)

  useEffect(() => {
    onLoadStateRef.current = onLoadState
  }, [onLoadState])

  useEffect(() => {
    let active = true
    let reloadTimer: number | undefined
    const deadline = window.setTimeout(() => {
      active = false
      window.clearTimeout(reloadTimer)
      if (turnstileLoad) forgetTurnstileLoad(turnstileLoad.script)
      onLoadStateRef.current('failed')
    }, TURNSTILE_LOAD_DEADLINE_MS)

    function request() {
      void loadTurnstile().then((turnstile) => {
        if (!active) return
        window.clearTimeout(deadline)
        setLoaded({ turnstile })
      }, () => {
        if (!active) return
        onLoadStateRef.current('loading')
        reloadTimer = window.setTimeout(request, TURNSTILE_RETRY_INTERVAL_MS)
      })
    }

    request()
    return () => {
      active = false
      window.clearTimeout(deadline)
      window.clearTimeout(reloadTimer)
    }
  }, [load])

  const loadAgain = useCallback(() => setLoad((value) => value + 1), [])
  return { loaded, loadAgain }
}

function useTurnstileChallenge({ siteKey, resetKey, onToken, onStateChange, theme, language }: ChallengeProps & Readonly<{ theme: 'light' | 'dark'; language: string }>) {
  const { containerRef, challengeVisible } = useChallengeVisibility()
  const widgetIdRef = useRef<unknown>(null)
  const automaticRetriesRef = useRef(0)
  const retryTimerRef = useRef<number | undefined>(undefined)
  const callbacksRef = useRef({ onToken, onStateChange })
  const handledResetKey = useRef(resetKey)
  const [state, setState] = useState<WidgetState>('idle')
  const { loaded, loadAgain } = useTurnstileScript({
    onLoadState: (next) => {
      setState(next)
      onStateChange?.(next)
      onToken(null)
    },
  })

  useEffect(() => {
    callbacksRef.current = { onToken, onStateChange }
  }, [onToken, onStateChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !loaded) return
    let active = true

    function update(next: WidgetState, token: string | null = null) {
      if (!active) return
      window.clearTimeout(retryTimerRef.current)
      setState(next)
      callbacksRef.current.onStateChange?.(next)
      callbacksRef.current.onToken(token)
    }

    function fail(code: string) {
      if (automaticRetriesRef.current >= MAX_AUTOMATIC_RETRIES || !isRetriedFailure(code)) {
        update('failed')
        return true
      }
      automaticRetriesRef.current += 1
      update('loading')
      retryTimerRef.current = window.setTimeout(() => {
        const widgetId = widgetIdRef.current
        if (active && widgetId != null) getTurnstile()?.reset(widgetId)
      }, TURNSTILE_RETRY_INTERVAL_MS)
      return true
    }

    automaticRetriesRef.current = 0
    widgetIdRef.current = loaded.turnstile.render(container, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      size: 'flexible',
      theme,
      language,
      retry: 'never',
      callback: (token) => {
        automaticRetriesRef.current = 0
        update('solved', token)
      },
      'error-callback': fail,
      'expired-callback': () => update('expired'),
      'before-interactive-callback': () => update('interactive'),
      'after-interactive-callback': () => update('loading'),
    })

    return () => {
      active = false
      window.clearTimeout(retryTimerRef.current)
      const widgetId = widgetIdRef.current
      if (widgetId != null) getTurnstile()?.remove(widgetId)
      widgetIdRef.current = null
    }
  }, [containerRef, loaded, siteKey, theme, language])

  const runAgain = useCallback(() => {
    window.clearTimeout(retryTimerRef.current)
    automaticRetriesRef.current = 0
    const widgetId = widgetIdRef.current
    if (widgetId != null) getTurnstile()?.reset(widgetId)
    else loadAgain()
  }, [loadAgain])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    if (resetKey !== handledResetKey.current) {
      handledResetKey.current = resetKey
      runAgain()
    }
    return () => { active = false }
  }, [resetKey, runAgain])

  function retry() {
    onToken(null)
    setState('loading')
    onStateChange?.('loading')
    runAgain()
  }

  return { containerRef, challengeVisible, state, retry }
}

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onStateChange,
  theme,
  language,
  quiet = false,
}: ChallengeProps & Readonly<{ theme?: 'light' | 'dark'; language?: string; quiet?: boolean }>) {
  const t = useTranslations()
  const appLocale = useLocale()
  const currentTheme = useCurrentTheme()
  const { containerRef, challengeVisible, state, retry } = useTurnstileChallenge({
    siteKey, resetKey, onToken, onStateChange, theme: theme ?? currentTheme,
    // WHY: Cloudflare lists Orbit's pt-BR as pt-br https://developers.cloudflare.com/turnstile/reference/supported-languages/
    language: (language ?? appLocale).toLowerCase(),
  })

  const statusVisible = !quiet && (state === 'loading' || state === 'failed' || state === 'expired')
  const position = challengeVisible || statusVisible ? undefined : 'absolute'
  // WHY: Cloudflare documents no success state for interaction-only, so the form hides the passed widget itself https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
  const challengeStyle = state === 'solved' ? { display: 'none' } : undefined
  if (quiet) return <div ref={containerRef} style={{ position, ...challengeStyle }} />
  const waitBox = state === 'loading' && !challengeVisible

  return (
    <div className="flex flex-col items-center text-center text-sm text-[var(--fg-2)]" style={{ gap: 8, position }}>
      <div ref={containerRef} className="w-full" style={challengeStyle} />
      <div data-turnstile-wait={waitBox ? '' : undefined} className={waitBox ? 'relative isolate grid w-full place-items-center overflow-hidden rounded-[var(--r-well)] px-4' : 'sr-only'}
        style={waitBox ? { height: FLEXIBLE_CHALLENGE_HEIGHT } : undefined}>
        {waitBox ? <SkeletonFace /> : null}
        <p role="status">{state === 'loading' ? t('auth.turnstileLoading') : ''}</p>
      </div>
      <p role="alert" className={`text-[var(--status-bad-text)] ${state === 'failed' || state === 'expired' ? '' : 'sr-only'}`}>
        {state === 'failed' || state === 'expired'
          ? t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired') : ''}
      </p>
      {(state === 'failed' || state === 'expired') &&
        <IconButton label={t('auth.turnstileRetry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
    </div>
  )
}
