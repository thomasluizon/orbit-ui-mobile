import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { addBreadcrumb } from '@sentry/react-native'
import { TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'
import { shouldLoadTurnstileFrame, TURNSTILE_ORIGIN_ALLOWLIST, urlHost } from '@/lib/turnstile-frames'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

// WHY: Cloudflare sizes the flexible widget at 100% width and 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65
// WHY: a sleeping Render web service answers its wake page with 503 https://render.com/docs/free
const TEMPORARY_HTTP_STATUSES = new Set([429, 502, 503, 504])

function recordLoadFailure(message: string, failure: Readonly<{ url: string; description?: string; statusCode?: number; code?: number }>) {
  addBreadcrumb({
    category: 'auth.turnstile',
    level: 'warning',
    message,
    data: { statusCode: failure.statusCode, code: failure.code, description: failure.description, host: urlHost(failure.url) },
  })
}

function useBridgeLoad(resetKey: number, onToken: (token: string | null) => void) {
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState(0)
  const onTokenRef = useRef(onToken)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loadDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { onTokenRef.current = onToken }, [onToken])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    return () => { active = false }
  }, [resetKey])

  useEffect(() => {
    loadDeadline.current = setTimeout(() => {
      loadDeadline.current = undefined
      clearTimeout(reloadTimer.current)
      onTokenRef.current(null)
      setState('failed')
    }, TURNSTILE_LOAD_DEADLINE_MS)
    return () => clearTimeout(loadDeadline.current)
  }, [resetKey, load])

  useEffect(() => () => clearTimeout(reloadTimer.current), [])

  function endLoad() {
    clearTimeout(reloadTimer.current)
    clearTimeout(loadDeadline.current)
    loadDeadline.current = undefined
  }

  function failLoad(temporary: boolean) {
    onToken(null)
    clearTimeout(reloadTimer.current)
    if (!temporary) {
      endLoad()
      setState('failed')
      return
    }
    if (loadDeadline.current === undefined) setLoad((value) => value + 1)
    setState('loading')
    reloadTimer.current = setTimeout(() => setAttempt((value) => value + 1), TURNSTILE_RETRY_INTERVAL_MS)
  }

  function onError(event: WebViewErrorEvent) {
    recordLoadFailure('Human check bridge load error', event.nativeEvent)
    failLoad(true)
  }

  function onHttpError(event: WebViewHttpErrorEvent) {
    recordLoadFailure('Human check bridge HTTP error', event.nativeEvent)
    failLoad(TEMPORARY_HTTP_STATUSES.has(event.nativeEvent.statusCode))
  }

  function onMessage(event: WebViewMessageEvent) {
    let message: unknown
    try {
      message = JSON.parse(event.nativeEvent.data)
    } catch {
      endLoad()
      setState('failed')
      onToken(null)
      return
    }
    if (!message || typeof message !== 'object') return
    if ('token' in message && (typeof message.token === 'string' || message.token === null)) {
      onToken(message.token)
    }
    if ('state' in message && (
      message.state === 'loading' || message.state === 'interactive' || message.state === 'solved' ||
      message.state === 'failed' || message.state === 'expired'
    )) {
      if (message.state !== 'loading') endLoad()
      setState(message.state)
    }
  }

  function retry() {
    onToken(null)
    endLoad()
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
  const { state, attempt, onError, onHttpError, onMessage, retry } = useBridgeLoad(resetKey, onToken)
  const challengeHostHeight = state === 'interactive' ? FLEXIBLE_CHALLENGE_HEIGHT : 0
  const takesNoSpace = state === 'idle' || state === 'solved'
  const bridgeUrl = `${APP_LINK_ORIGIN}/turnstile-bridge?siteKey=${encodeURIComponent(siteKey)}&theme=${currentTheme}&language=${encodeURIComponent(i18n.language)}`

  return (
    // WHY: the clip of the idle and solved states makes Fabric create the root only then, and Android lost the moved check when it passed (Unable to find viewState). https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactCommon/react/renderer/components/view/ViewShadowNode.cpp#L44-L52
    <View collapsable={false} style={{ alignItems: 'center', alignSelf: 'stretch',
      ...(takesNoSpace ? { position: 'absolute', left: 0, right: 0, height: 0, overflow: 'hidden' } as const : {}) }}>
      <View testID="turnstile-challenge" style={{ alignSelf: 'stretch', height: challengeHostHeight, overflow: 'hidden' }}>
        {state === 'failed' ? null :
          <WebView
            key={`${resetKey}-${attempt}`}
            source={{ uri: bridgeUrl }}
            originWhitelist={TURNSTILE_ORIGIN_ALLOWLIST}
            onShouldStartLoadWithRequest={(request) => shouldLoadTurnstileFrame(request, APP_LINK_ORIGIN)}
            accessibilityLabel={t('auth.turnstileLabel')}
            containerStyle={{ width: '100%', height: FLEXIBLE_CHALLENGE_HEIGHT, flex: 0, backgroundColor: tokens.bg }}
            style={{ width: '100%', height: FLEXIBLE_CHALLENGE_HEIGHT, flex: 0, backgroundColor: tokens.bg }}
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
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
          {state === 'loading' && <Text style={{ color: tokens.fg2 }}>{t('auth.turnstileLoading')}</Text>}
          {(state === 'failed' || state === 'expired') &&
            <Text style={{ color: tokens.statusBadText }} accessibilityRole="alert">
              {t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired')}
            </Text>}
        </View>
        {(state === 'failed' || state === 'expired') &&
          <IconButton label={t('auth.turnstileRetry')} onClick={retry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
      </View>
    </View>
  )
}
