import { useEffect, useState, useTransition } from 'react'
import { AppState, ScrollView, Text, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getErrorSurface, getRetryCountdown } from '@orbit/shared/utils'
import { i18n } from '@/lib/i18n'
import { createTokensV2, getRuntimeTheme } from '@/lib/theme'
import { ThemedButton } from '@/components/ui/pill-button'
import { errorSurfaceStyles as styles } from './error-surface-styles'

export function AppErrorScreen({ error, retry, standalone = false }: Readonly<{ error: unknown; retry: () => void | Promise<void>; standalone?: boolean }>) {
  const { width } = useWindowDimensions()
  // WHY: The root error screen must render even if theme state is missing: https://github.com/thomasluizon/orbit-tickets/issues/1737
  const runtimeTheme = getRuntimeTheme() as ReturnType<typeof getRuntimeTheme> | undefined
  const tokens = createTokensV2('orange', runtimeTheme?.themeMode === 'light' ? 'light' : 'dark')
  const { requestId, retryAt } = getErrorSurface(error)
  const [now, setNow] = useState(() => Date.now())
  const [retrying, startRetry] = useTransition()
  useEffect(() => {
    if (retryAt === null) return
    const update = () => setNow(Date.now())
    const interval = setInterval(update, 250)
    const subscription = AppState.addEventListener('change', update)
    return () => { clearInterval(interval); subscription.remove() }
  }, [retryAt])
  const countdown = retryAt === null ? null : getRetryCountdown(retryAt, now)
  const waiting = countdown !== null && countdown.seconds > 0
  const handleRetry = () => {
    if (retryAt !== null && getRetryCountdown(retryAt, Date.now()).seconds > 0) return
    startRetry(async () => { await retry() })
  }
  const screen = (
    <ScrollView style={{ backgroundColor: tokens.bg }} contentContainerStyle={[styles.root, styles.flow]} testID={countdown ? 'throttle-screen' : 'failure-screen'}>
      <Text accessibilityRole="header" textBreakStrategy="simple" android_hyphenationFrequency="none" style={[styles.title, width >= 1024 && styles.titleWide, { color: tokens.fg1 }]}>{i18n.t(countdown ? 'errorScreen.throttleTitle' : 'errorScreen.title')}</Text>
      <Text style={[styles.body, { color: tokens.fg2 }]}>{i18n.t(countdown ? 'errorScreen.throttleBody' : 'errorScreen.body')}</Text>
      {countdown ? <Text accessibilityRole="timer" style={[styles.countdown, { color: tokens.fg1 }]}>{countdown.label}</Text> : null}
      <ThemedButton tokens={tokens} variant={waiting ? 'ghost' : 'primary'} disabled={waiting} loading={retrying} onClick={handleRetry}>{i18n.t('errorScreen.retry')}</ThemedButton>
      {!countdown && requestId ? <Text selectable style={[styles.reference, { color: tokens.fg3 }]}>{i18n.t('errorScreen.reference', { requestId })}</Text> : null}
    </ScrollView>
  )
  return standalone ? <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: tokens.bg }}>{screen}</SafeAreaView> : screen
}
