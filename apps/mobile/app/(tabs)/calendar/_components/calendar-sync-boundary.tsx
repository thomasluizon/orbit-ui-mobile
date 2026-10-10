import { ListRow } from '@/components/ui/list-row'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { useOffline } from '@/hooks/use-offline'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { AppTokensV2 } from '@/lib/theme'

interface CalendarSyncBoundaryProps {
  isConnected: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
  t: TFunction
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  tokens: AppTokensV2
}

export function CalendarSyncBoundary({ isConnected, autoSyncState, onAutoSyncChange, onSyncNow, tokens, t, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const { isOnline } = useOffline()
  const [pendingAction, setPendingAction] = useAccountScopedState<'toggle' | 'sync' | null>(null)
  const [error, setError] = useAccountScopedState<string | null>(null)
  const lastSynced = formatCalendarSyncTimestamp(autoSyncState?.lastSyncedAt ?? null, locale, timeZone, uses24HourClock)

  async function runAction(kind: 'toggle' | 'sync', action: () => Promise<void>) {
    if (pendingAction || !isOnline) return
    const generation = getAccountGeneration()
    setPendingAction(kind)
    setError(null)
    try { await action() }
    catch (failure: unknown) {
      if (generation === getAccountGeneration()) setError(getFriendlyErrorMessage(failure, t, 'calendar.autoSync.syncFailed', 'generic'))
    } finally {
      if (generation === getAccountGeneration()) setPendingAction(null)
    }
  }

  return <View style={styles.container} testID="calendar-sync-line">
    <Text style={[styles.label, { color: tokens.fg2 }]}>{t(isConnected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</Text>
    <View style={styles.timestamp}>
      <Text style={[styles.meta, { color: tokens.fg3 }]}>{t('calendar.dayDetail.lastSyncedLabel')}</Text>
      <Text style={[styles.date, { color: tokens.fg3 }]}>{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</Text>
    </View>
    {isConnected ? <>
      {/* eslint-disable-next-line local/max-button-words -- Orbit Calendario draws the labelled auto-sync switch. */}
      <ListRow title={t('calendar.dayDetail.autoSync')} disabled={!isOnline || pendingAction !== null} toggle={{ checked: autoSyncState?.enabled ?? false, onChange: (enabled) => void runAction('toggle', () => onAutoSyncChange(enabled)) }} />
      <View style={styles.action}><PillButton variant="ghost" size="sm" disabled={!isOnline || pendingAction !== null} loading={pendingAction === 'sync'} onClick={() => void runAction('sync', onSyncNow)}>{t('calendar.autoSync.syncNow')}</PillButton></View>
    </> : null}
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.label, { color: tokens.statusBadText }]}>{error ?? (autoSyncState?.status === 'TransientError' ? t('calendar.autoSync.syncFailed') : '')}</Text>
  </View>
}

const styles = StyleSheet.create({
  container: { minWidth: 0, gap: 8 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  timestamp: { gap: 4 },
  meta: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  date: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, fontVariant: ['tabular-nums'] },
  action: { alignItems: 'flex-end' },
})
