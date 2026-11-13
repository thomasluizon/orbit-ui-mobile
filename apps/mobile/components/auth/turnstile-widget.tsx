import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'
import { shouldLoadTurnstileFrame, TURNSTILE_ORIGIN_ALLOWLIST } from '@/lib/turnstile-frames'

type WidgetState = 'idle' | 'loading' | 'interactive' | 'solved' | 'failed' | 'expired'

// WHY: Cloudflare sizes the flexible widget at 100% width and 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onSpaceChange,
}: Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onSpaceChange?: (height: number) => void
}>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)
  const challengeHostHeight = state === 'interactive' ? FLEXIBLE_CHALLENGE_HEIGHT : 0
  const takesNoSpace = state === 'idle' || state === 'solved'
  const rootRef = useRef<View>(null)
  const bridgeUrl = `${APP_LINK_ORIGIN}/turnstile-bridge?siteKey=${encodeURIComponent(siteKey)}&theme=${currentTheme}&language=${encodeURIComponent(i18n.language)}`

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    return () => { active = false }
  }, [resetKey])

  // WHY: a layout read in a layout effect lands in the commit that changed the check, an onLayout state update paints a frame late. https://reactnative.dev/architecture/landing-page#synchronous-layout-and-effects
  useLayoutEffect(() => {
    if (!onSpaceChange) return
    if (takesNoSpace) onSpaceChange(0)
    else rootRef.current?.measureInWindow((_x, _y, _width, height) => onSpaceChange(height))
  })

  function onMessage(event: WebViewMessageEvent) {
    let message: unknown
    try {
      message = JSON.parse(event.nativeEvent.data)
    } catch {
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
      setState(message.state)
    }
  }

  function retry() {
    onToken(null)
    setState('loading')
    setAttempt((value) => value + 1)
  }

  return (
    <View ref={rootRef} style={{ alignItems: 'center', alignSelf: 'stretch',
      ...(takesNoSpace ? { position: 'absolute', left: 0, right: 0, height: 0, overflow: 'hidden' } as const : {}) }}>
      <View testID="turnstile-challenge" style={{ alignSelf: 'stretch', height: challengeHostHeight, overflow: 'hidden' }}>
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
          onError={() => { setState('failed'); onToken(null) }}
          onHttpError={() => { setState('failed'); onToken(null) }}
        />
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
