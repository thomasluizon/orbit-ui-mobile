import { useEffect, useState, useTransition } from 'react'
import { AppState, ScrollView, Text } from 'react-native'
import { getErrorSurface, getRetryCountdown } from '@orbit/shared/utils'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { errorSurfaceStyles as styles } from './error-surface-styles'

export function AppErrorScreen({ error, retry }: Readonly<{ error: unknown; retry: () => void | Promise<void> }>) {
  const tokens = createTokensV2()
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
  return (
    <ScrollView style={{ backgroundColor: tokens.bg }} contentContainerStyle={styles.root} testID={countdown ? 'throttle-screen' : 'failure-screen'}>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{i18n.t(countdown ? 'errorScreen.throttleTitle' : 'errorScreen.title')}</Text>
      <Text style={[styles.body, { color: tokens.fg2 }]}>{i18n.t(countdown ? 'errorScreen.throttleBody' : 'errorScreen.body')}</Text>
      {countdown ? <Text accessibilityRole="timer" style={[styles.countdown, { color: tokens.fg1 }]}>{countdown.label}</Text> : null}
      <PillButton variant={waiting ? 'ghost' : 'primary'} disabled={waiting} loading={retrying} onClick={handleRetry}>{i18n.t('errorScreen.retry')}</PillButton>
      {!countdown && requestId ? <Text selectable style={[styles.reference, { color: tokens.fg3 }]}>{i18n.t('errorScreen.reference', { requestId })}</Text> : null}
    </ScrollView>
  )
}
