import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { SkeletonFace } from '@/components/ui/skeleton'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { addBreadcrumb, captureMessage } from '@sentry/react-native'
import {
  createTurnstileLoadFailureReporter, TURNSTILE_BRIDGE_RETRY_STATUSES, TURNSTILE_CHALLENGE_HEIGHT, TURNSTILE_CHALLENGE_HOST,
  TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS, turnstileBridgeRetryDelayMs, type TurnstileBridgeStage, type TurnstileLoadFailure,
} from '@orbit/shared/hooks/turnstile-token-core'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes'
import { SPACING } from '@orbit/shared/theme'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'
import { shouldLoadTurnstileFrame, TURNSTILE_ORIGIN_ALLOWLIST, urlHost } from '@/lib/turnstile-frames'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

// WHY: a rate limit passes by itself, and the bridge loads again at the retry interval https://developer.mozilla.org/docs/Web/HTTP/Status/429
const TEMPORARY_HTTP_STATUSES = new Set([429, ...TURNSTILE_BRIDGE_RETRY_STATUSES])
const BRIDGE_FAILURE_KINDS = ['script', 'script_deadline', 'challenge'] as const
const STAGE_DEADLINES: Record<TurnstileBridgeStage, TurnstileLoadFailure> = {
  script_started: { kind: 'script_deadline', host: TURNSTILE_CHALLENGE_HOST },
  script_loaded: { kind: 'run_deadline', host: TURNSTILE_CHALLENGE_HOST },
}
const FAILURE_MESSAGES: Record<TurnstileLoadFailure['kind'], string> = {
  http: 'Human check bridge HTTP error',
  load: 'Human check bridge load error',
  script: 'Human check script load error',
  script_deadline: 'Human check script load deadline',
  challenge: 'Human check challenge error',
  run_deadline: 'Human check run deadline',
  bridge_deadline: 'Human check bridge page deadline',
  message: 'Human check bridge message error',
}

type BridgeFailure = Readonly<{ kind: typeof BRIDGE_FAILURE_KINDS[number]; code?: string }>

function readBridgeFailure(message: object): BridgeFailure | null {
  if (!('failure' in message) || !message.failure || typeof message.failure !== 'object') return null
  const { kind, code } = message.failure as { kind?: unknown; code?: unknown }
  const known = BRIDGE_FAILURE_KINDS.find((candidate) => candidate === kind)
  if (!known) return null
  // WHY: Cloudflare's client-side error codes are digits only, and nothing else of a bridge message may reach Sentry https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
  return typeof code === 'string' && /^\d{1,12}$/.test(code) ? { kind: known, code } : { kind: known }
}

function readBridgeStage(message: object): TurnstileBridgeStage | null {
  if (!('stage' in message)) return null
  return Object.keys(STAGE_DEADLINES).find((stage): stage is TurnstileBridgeStage => stage === message.stage) ?? null
}

function useLoadFailureReport(resetKey: number) {
  const report = useRef<((failure: TurnstileLoadFailure) => void) | null>(null)
  const startReport = useCallback(() => { report.current = createTurnstileLoadFailureReporter(captureMessage) }, [])
  useEffect(startReport, [resetKey, startReport])

  const leaveBreadcrumb = useCallback((failure: TurnstileLoadFailure) => {
    addBreadcrumb({
      category: 'auth.turnstile',
      level: 'warning',
      message: FAILURE_MESSAGES[failure.kind],
      data: { statusCode: failure.statusCode, code: failure.code, description: failure.description, host: failure.host },
    })
  }, [])
  const reportFailure = useCallback((failure: TurnstileLoadFailure) => { report.current?.(failure) }, [])
  const recordFailure = useCallback((failure: TurnstileLoadFailure) => {
    leaveBreadcrumb(failure)
    reportFailure(failure)
  }, [leaveBreadcrumb, reportFailure])
  return { recordFailure, leaveBreadcrumb, reportFailure, startReport }
}

function useBridgeLoad(resetKey: number, bridgeHost: string, onToken: (token: string | null) => void) {
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState(0)
  const onTokenRef = useRef(onToken)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stopDeadline = useRef<() => void>(() => {})
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active')
  const deadlineLive = useRef(false)
  const bridgeStage = useRef<TurnstileBridgeStage | null>(null)
  const heldFailure = useRef<TurnstileLoadFailure | null>(null)
  const retryStatusCount = useRef(0)
  const bridgeFailures = useRef<TurnstileLoadFailure[]>([])
  const { recordFailure, leaveBreadcrumb, reportFailure, startReport } = useLoadFailureReport(resetKey)
  const reportBridgeFailures = useCallback(() => {
    for (const failure of bridgeFailures.current) reportFailure(failure)
    bridgeFailures.current = []
  }, [reportFailure])

  useEffect(() => { onTokenRef.current = onToken }, [onToken])
  useEffect(() => { bridgeStage.current = null }, [resetKey, attempt])
  useEffect(() => { heldFailure.current = null; retryStatusCount.current = 0; bridgeFailures.current = [] }, [resetKey])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    return () => { active = false }
  }, [resetKey])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setAppActive(next === 'active'))
    return () => subscription.remove()
  }, [])

  useEffect(() => { deadlineLive.current = true }, [resetKey, load])

  useEffect(() => {
    // WHY: Android pauses a WebView whose activity is not in front (the Google sign-in browser), so a deadline that runs there reports a failure the person never saw https://developer.android.com/reference/android/webkit/WebView#onPause()
    if (!appActive || !deadlineLive.current) return
    const deadline = setTimeout(() => {
      deadlineLive.current = false
      clearTimeout(reloadTimer.current)
      if (heldFailure.current) reportFailure(heldFailure.current)
      reportBridgeFailures()
      recordFailure(bridgeStage.current ? STAGE_DEADLINES[bridgeStage.current] : { kind: 'bridge_deadline', host: bridgeHost })
      onTokenRef.current(null)
      setState('failed')
    }, TURNSTILE_LOAD_DEADLINE_MS)
    stopDeadline.current = () => clearTimeout(deadline)
    return () => clearTimeout(deadline)
  }, [resetKey, load, appActive, bridgeHost, recordFailure, reportFailure, reportBridgeFailures])

  useEffect(() => () => clearTimeout(reloadTimer.current), [])

  function endLoad() {
    clearTimeout(reloadTimer.current)
    stopDeadline.current()
    deadlineLive.current = false
  }

  function clearHeldFailure() {
    heldFailure.current = null
    retryStatusCount.current = 0
  }

  function holdBridgeFailure(failure: TurnstileLoadFailure) {
    if (failure.kind === 'script_deadline') {
      reportBridgeFailures()
      recordFailure(failure)
      return
    }
    leaveBreadcrumb(failure)
    if (!bridgeFailures.current.some(({ kind, code }) => kind === failure.kind && code === failure.code)) bridgeFailures.current.push(failure)
  }

  function settleBridgeFailures(next: WidgetState) {
    if (next === 'failed') reportBridgeFailures()
    if (next === 'solved') bridgeFailures.current = []
  }

  function failLoad(temporary: boolean, delayMs = TURNSTILE_RETRY_INTERVAL_MS) {
    onToken(null)
    clearTimeout(reloadTimer.current)
    if (!temporary) {
      endLoad()
      setState('failed')
      return
    }
    if (!deadlineLive.current) setLoad((value) => value + 1)
    setState('loading')
    reloadTimer.current = setTimeout(() => setAttempt((value) => value + 1), delayMs)
  }

  function onError(event: WebViewErrorEvent) {
    const { code, description, url } = event.nativeEvent
    recordFailure({ kind: 'load', host: urlHost(url), code: String(code), description })
    failLoad(true)
  }

  function onHttpError(event: WebViewHttpErrorEvent) {
    const { statusCode, description, url } = event.nativeEvent
    const failure: TurnstileLoadFailure = { kind: 'http', host: urlHost(url), statusCode, description }
    if (TURNSTILE_BRIDGE_RETRY_STATUSES.has(statusCode)) {
      leaveBreadcrumb(failure)
      heldFailure.current = failure
      failLoad(true, turnstileBridgeRetryDelayMs(retryStatusCount.current))
      retryStatusCount.current += 1
      return
    }
    recordFailure(failure)
    failLoad(TEMPORARY_HTTP_STATUSES.has(statusCode))
  }

  function onMessage(event: WebViewMessageEvent) {
    let message: unknown
    try {
      message = JSON.parse(event.nativeEvent.data)
    } catch {
      recordFailure({ kind: 'message', host: bridgeHost })
      endLoad()
      setState('failed')
      onToken(null)
      return
    }
    if (!message || typeof message !== 'object') return
    const failure = readBridgeFailure(message)
    if (failure) holdBridgeFailure({ ...failure, host: TURNSTILE_CHALLENGE_HOST })
    const stage = readBridgeStage(message)
    if (stage) {
      clearHeldFailure()
      bridgeStage.current = stage
      if (deadlineLive.current) setLoad((value) => value + 1)
    }
    if ('token' in message && (typeof message.token === 'string' || message.token === null)) {
      onToken(message.token)
    }
    if ('state' in message && (
      message.state === 'loading' || message.state === 'interactive' || message.state === 'solved' ||
      message.state === 'failed' || message.state === 'expired'
    )) {
      clearHeldFailure()
      settleBridgeFailures(message.state)
      endLoad()
      if (message.state === 'loading') setLoad((value) => value + 1)
      setState(message.state)
    }
  }

  function retry() {
    onToken(null)
    endLoad()
    startReport()
    clearHeldFailure()
    bridgeFailures.current = []
    setLoad((value) => value + 1)
    setState('loading')
    setAttempt((value) => value + 1)
  }

  return { state, attempt, onError, onHttpError, onMessage, retry }
}

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
}: Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
}>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const bridgeUrl = `${APP_LINK_ORIGIN}/turnstile-bridge?siteKey=${encodeURIComponent(siteKey)}&theme=${currentTheme}&language=${encodeURIComponent(i18n.language)}`
  const { state, attempt, onError, onHttpError, onMessage, retry } = useBridgeLoad(resetKey, urlHost(APP_LINK_ORIGIN), onToken)
  const challengeHidden = state !== 'interactive'
  const stopped = state === 'failed' || state === 'expired'

  return (
    // WHY: the root is one native view in every state: when Fabric created it only at the pass, Android lost the moved check (Unable to find viewState). https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactCommon/react/renderer/components/view/ViewShadowNode.cpp#L44-L52
    <View collapsable={false} style={{ alignSelf: 'stretch', minHeight: TURNSTILE_CHALLENGE_HEIGHT, justifyContent: 'center' }}>
      <View testID="turnstile-challenge" importantForAccessibility={challengeHidden ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={challengeHidden}
        style={{ alignSelf: 'stretch', height: challengeHidden ? 0 : TURNSTILE_CHALLENGE_HEIGHT, overflow: 'hidden' }}>
        {state === 'failed' ? null :
          <WebView
            key={`${resetKey}-${attempt}`}
            source={{ uri: bridgeUrl }}
            originWhitelist={TURNSTILE_ORIGIN_ALLOWLIST}
            onShouldStartLoadWithRequest={(request) => shouldLoadTurnstileFrame(request, APP_LINK_ORIGIN)}
            accessibilityLabel={t('auth.turnstileLabel')}
            containerStyle={{ width: '100%', height: TURNSTILE_CHALLENGE_HEIGHT, flex: 0, backgroundColor: tokens.bg }}
            style={{ width: '100%', height: TURNSTILE_CHALLENGE_HEIGHT, flex: 0, backgroundColor: tokens.bg }}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            onMessage={onMessage}
            onError={onError}
            onHttpError={onHttpError}
          />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <View accessibilityLiveRegion="polite" style={{ flexShrink: 1, flexGrow: state === 'loading' ? 1 : 0 }}>
          {state === 'loading' && <View testID="turnstile-wait" style={{ height: TURNSTILE_CHALLENGE_HEIGHT, alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: SPACING.s16, borderRadius: radius.md, overflow: 'hidden' }}>
            <SkeletonFace tokens={tokens} />
            <Text style={{ color: tokens.fg2, textAlign: 'center' }}>{t('auth.turnstileLoading')}</Text>
          </View>}
          {stopped &&
            <Text style={{ color: tokens.statusBadText, textAlign: 'center' }} accessibilityRole="alert">
              {t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired')}
            </Text>}
        </View>
        {stopped &&
          <IconButton label={t('auth.turnstileRetry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
      </View>
    </View>
  )
}
