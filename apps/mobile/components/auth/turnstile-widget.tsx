import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type WidgetState = 'loading' | 'solved' | 'failed' | 'expired'

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
  const [state, setState] = useState<WidgetState>('loading')
  const [attempt, setAttempt] = useState(0)
  const bridgeUrl = `https://app.useorbit.org/turnstile-bridge?siteKey=${encodeURIComponent(siteKey)}`

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
        style={{ width: '100%', maxWidth: 320, height: 160, backgroundColor: 'transparent' }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        onMessage={onMessage}
        onError={() => { setState('failed'); onToken(null) }}
        onHttpError={() => { setState('failed'); onToken(null) }}
      />
      {state === 'loading' && <Text style={{ color: tokens.fg2 }}>{t('auth.turnstileLoading')}</Text>}
      {(state === 'failed' || state === 'expired') && (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ color: tokens.fg2 }} accessibilityRole="alert">
            {t(state === 'failed' ? 'auth.turnstileFailed' : 'auth.turnstileExpired')}
          </Text>
          <Pressable onPress={retry} accessibilityRole="button">
            <Text style={{ color: tokens.primarySoft }}>{t('auth.turnstileRetry')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
