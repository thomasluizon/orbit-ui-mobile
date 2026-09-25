import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'

type WidgetState = 'idle' | 'loading' | 'solved' | 'failed' | 'expired'

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
}: Readonly<{
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [state, setState] = useState<WidgetState>('idle')
  const [attempt, setAttempt] = useState(0)
  const challengeHeight = state === 'solved' ? 0 : 160
  const bridgeUrl = `https://app.useorbit.org/turnstile-bridge?siteKey=${encodeURIComponent(siteKey)}&theme=${currentTheme}`

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) setState('loading') })
    return () => { active = false }
  }, [resetKey])

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
      message.state === 'loading' || message.state === 'solved' ||
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
    <View style={{ alignItems: 'center', alignSelf: 'stretch', gap: 8 }}>
      <WebView
        key={`${resetKey}-${attempt}`}
        source={{ uri: bridgeUrl }}
        containerStyle={{ width: 256, height: challengeHeight, flex: 0, backgroundColor: tokens.bg }}
        style={{ width: 256, height: challengeHeight, flex: 0, backgroundColor: tokens.bg }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        onMessage={onMessage}
        onError={() => { setState('failed'); onToken(null) }}
        onHttpError={() => { setState('failed'); onToken(null) }}
      />
      <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
        {state === 'loading' && <Text style={{ color: tokens.fg2 }}>{t('auth.turnstileLoading')}</Text>}
        {(state === 'failed' || state === 'expired') &&
          <Text style={{ color: tokens.statusBadText }} accessibilityRole="alert">
            {t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired')}
          </Text>}
      </View>
      {(state === 'failed' || state === 'expired') &&
        <PillButton variant="ghost" size="sm" onClick={retry}>{t('auth.turnstileRetry')}</PillButton>}
    </View>
  )
}
