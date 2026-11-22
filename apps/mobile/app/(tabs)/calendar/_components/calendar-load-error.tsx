import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isNetworkUnavailableError } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useFlag } from '@/hooks/use-flag'
import { useOffline } from '@/hooks/use-offline'
import type { createTokensV2 } from '@/lib/theme'
import { createStyles } from './calendar-screen-styles'

/** The load failure of the calendar views. With the guided flows on it is the shared state surface: Orbit in Parado, one first person line and the retry, centred in the free area. A read that failed for want of a connection says so. With the flag off it is the kit card. */
export function CalendarLoadError({ onRetry, tokens, error }: Readonly<{ onRetry: () => void; tokens: ReturnType<typeof createTokensV2>; error?: unknown }>) {
  const { t } = useTranslation()
  const guided = useFlag('orbit_guided_flows')
  const { isOnline } = useOffline()
  const styles = useMemo(() => createStyles(), [])
  const retry = <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
  if (guided) {
    const offline = !isOnline || isNetworkUnavailableError(error)
    return <ErrorState fullSurface message={t(offline ? 'offline.description' : 'calendar.orbit.loadError')} action={retry} />
  }
  return <View style={styles.errorWrap}>
    <View style={[styles.errorCard, { backgroundColor: tokens.bgCard, outlineColor: tokens.hairline }]}>
      <Text style={[styles.errorText, { color: tokens.fg2 }]}>{t('calendar.loadError')}</Text>
      {retry}
    </View>
  </View>
}
