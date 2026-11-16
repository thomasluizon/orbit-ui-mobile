'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { captureMessage } from '@sentry/nextjs'
import {
  createTurnstileLoadFailureReporter, TURNSTILE_CHALLENGE_HEIGHT, TURNSTILE_CHALLENGE_HOST, TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS,
  type TurnstileBridgeStage,
} from '@orbit/shared/hooks/turnstile-token-core'
import { useCurrentTheme } from '@/stores/theme-store'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

type ChallengeFailure = Readonly<{ kind: 'script' | 'script_deadline' | 'challenge' | 'run_deadline'; code?: string }>

type ChallengeProps = Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onStateChange?: (state: WidgetState) => void
  onFailure?: (failure: ChallengeFailure) => void
  onScriptStage?: (stage: TurnstileBridgeStage) => void
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

function useTurnstileScript({ onLoadState, onScriptStage }: Readonly<{
  onLoadState: (state: 'loading' | 'failed') => void
  onScriptStage: ChallengeProps['onScriptStage']
}>) {
  const [loaded, setLoaded] = useState<Readonly<{ turnstile: TurnstileApi }> | null>(null)
  const [load, setLoad] = useState(0)
  const onLoadStateRef = useRef(onLoadState)
  const onScriptStageRef = useRef(onScriptStage)

  useEffect(() => {
    onLoadStateRef.current = onLoadState
    onScriptStageRef.current = onScriptStage
  }, [onLoadState, onScriptStage])

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
        onScriptStageRef.current?.('script_loaded')
        setLoaded({ turnstile })
      }, () => {
        if (!active) return
        onLoadStateRef.current('loading')
        reloadTimer = window.setTimeout(request, TURNSTILE_RETRY_INTERVAL_MS)
      })
    }

    onScriptStageRef.current?.('script_started')
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

function useLoadFailureReport(resetKey: number, onFailure: ChallengeProps['onFailure']) {
  const onFailureRef = useRef(onFailure)
  const report = useRef<ReturnType<typeof createTurnstileLoadFailureReporter> | null>(null)
  const startReport = useCallback(() => { report.current = createTurnstileLoadFailureReporter(captureMessage) }, [])
  useEffect(() => { onFailureRef.current = onFailure }, [onFailure])
  useEffect(startReport, [resetKey, startReport])

  const recordFailure = useCallback((failure: ChallengeFailure) => {
    if (onFailureRef.current) onFailureRef.current(failure)
    else report.current?.({ ...failure, host: TURNSTILE_CHALLENGE_HOST })
  }, [])
  return { recordFailure, startReport }
}

function useChallengeDeadline({ running, resetKey, stage, onDeadline }: Readonly<{ running: boolean; resetKey: number; stage: number; onDeadline: () => void }>) {
  const onDeadlineRef = useRef(onDeadline)
  useEffect(() => { onDeadlineRef.current = onDeadline }, [onDeadline])
  useEffect(() => {
    if (!running) return
    const deadline = window.setTimeout(() => onDeadlineRef.current(), TURNSTILE_LOAD_DEADLINE_MS)
    return () => window.clearTimeout(deadline)
  }, [running, resetKey, stage])
}

function useTurnstileChallenge({ siteKey, resetKey, onToken, onStateChange, onFailure, onScriptStage, theme, language, hasLoadDeadline }: ChallengeProps & Readonly<{ theme: 'light' | 'dark'; language: string; hasLoadDeadline: boolean }>) {
  const { containerRef, challengeVisible } = useChallengeVisibility()
  const widgetIdRef = useRef<unknown>(null)
  const automaticRetriesRef = useRef(0)
  const retryTimerRef = useRef<number | undefined>(undefined)
  const callbacksRef = useRef({ onToken, onStateChange })
  const handledResetKey = useRef(resetKey)
  const [state, setState] = useState<WidgetState>('idle')
  const [stage, setStage] = useState(0)
  const { recordFailure, startReport } = useLoadFailureReport(resetKey, onFailure)
  const { loaded, loadAgain } = useTurnstileScript({
    onScriptStage,
    onLoadState: (next) => {
      recordFailure({ kind: next === 'failed' ? 'script_deadline' : 'script' })
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
      if (next === 'loading') setStage((value) => value + 1)
      setState(next)
      callbacksRef.current.onStateChange?.(next)
      callbacksRef.current.onToken(token)
    }

    function fail(code: string) {
      recordFailure({ kind: 'challenge', code })
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
  }, [containerRef, loaded, siteKey, theme, language, recordFailure])

  const runAgain = useCallback(() => {
    window.clearTimeout(retryTimerRef.current)
    automaticRetriesRef.current = 0
    const widgetId = widgetIdRef.current
    if (widgetId != null) getTurnstile()?.reset(widgetId)
    else loadAgain()
  }, [loadAgain])

  useChallengeDeadline({
    running: hasLoadDeadline && loaded !== null && state === 'loading', resetKey, stage,
    onDeadline: () => {
      recordFailure({ kind: 'run_deadline' })
      setState('failed')
      onStateChange?.('failed')
      onToken(null)
    },
  })

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
    startReport()
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
  onFailure,
  onScriptStage,
  theme,
  language,
  quiet = false,
}: ChallengeProps & Readonly<{ theme?: 'light' | 'dark'; language?: string; quiet?: boolean }>) {
  const t = useTranslations()
  const appLocale = useLocale()
  const currentTheme = useCurrentTheme()
  const { containerRef, challengeVisible, state, retry } = useTurnstileChallenge({
    siteKey, resetKey, onToken, onStateChange, onFailure, onScriptStage, theme: theme ?? currentTheme, hasLoadDeadline: !quiet,
    // WHY: Cloudflare lists Orbit's pt-BR as pt-br https://developers.cloudflare.com/turnstile/reference/supported-languages/
    language: (language ?? appLocale).toLowerCase(),
  })

  // WHY: Cloudflare documents no success state for interaction-only, so the form hides the passed widget itself https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
  const passedStyle = { display: state === 'solved' ? 'none' : undefined }
  if (quiet) return <div ref={containerRef} style={{ position: challengeVisible ? undefined : 'absolute', ...passedStyle }} />

  const stopped = state === 'failed' || state === 'expired'
  const challengeHidden = state !== 'interactive'
  return (
    <div data-testid="turnstile-slot" className="flex flex-col justify-center text-sm text-[var(--fg-2)]" style={{ minHeight: TURNSTILE_CHALLENGE_HEIGHT }}>
      <div data-testid="turnstile-challenge" inert={challengeHidden || undefined} aria-hidden={challengeHidden || undefined}
        style={{ height: challengeHidden ? 0 : TURNSTILE_CHALLENGE_HEIGHT, overflowY: 'clip' }}>
        <div ref={containerRef} className="w-full" style={passedStyle} />
      </div>
      <div className="flex items-center justify-center gap-2 text-center">
        <p role="status" className={state === 'loading' ? '' : 'sr-only'}>
          {state === 'loading' ? t('auth.turnstileLoading') : ''}
        </p>
        <p role="alert" className={`text-[var(--status-bad-text)] ${stopped ? '' : 'sr-only'}`}>
          {stopped ? t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired') : ''}
        </p>
        {stopped &&
          <IconButton label={t('auth.turnstileRetry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      </div>
    </div>
  )
}
