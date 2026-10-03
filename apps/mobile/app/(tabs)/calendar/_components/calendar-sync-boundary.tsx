import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage, isCalendarSyncConnectionActive } from '@orbit/shared/utils'
import { Switch } from '@/components/ui/switch'
import { PillButton } from '@/components/ui/pill-button'
import { useOffline } from '@/hooks/use-offline'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { AppTokensV2 } from '@/lib/theme'

interface CalendarSyncBoundaryProps {
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
  t: TFunction
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  tokens: AppTokensV2
}

export function CalendarSyncBoundary({ autoSyncState, onAutoSyncChange, onSyncNow, tokens, t, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const { isOnline } = useOffline()
  const [pendingAction, setPendingAction] = useAccountScopedState<'toggle' | 'sync' | null>(null)
  const [error, setError] = useAccountScopedState<string | null>(null)
  const connected = isCalendarSyncConnectionActive(autoSyncState?.hasGoogleConnection ?? false, autoSyncState?.status ?? 'Idle')
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
    <Text style={[styles.label, { color: tokens.fg2 }]}>{t(connected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</Text>
    <View style={styles.timestamp}>
      <Text style={[styles.meta, { color: tokens.fg3 }]}>{t('calendar.dayDetail.lastSyncedLabel')}</Text>
      <Text style={[styles.date, { color: tokens.fg3 }]}>{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</Text>
    </View>
    {connected ? <>
      <View style={styles.switchLine}>
        <Text style={[styles.switchLabel, { color: tokens.fg2 }]}>{t('calendar.dayDetail.autoSync')}</Text>
        <Switch checked={autoSyncState?.enabled ?? false} disabled={!isOnline || pendingAction !== null} onChange={(enabled) => void runAction('toggle', () => onAutoSyncChange(enabled))} label={t('calendar.dayDetail.autoSync')} />
      </View>
      <View style={styles.action}><PillButton variant="ghost" size="sm" disabled={!isOnline || pendingAction !== null} loading={pendingAction === 'sync'} onClick={() => void runAction('sync', onSyncNow)}>{t('calendar.autoSync.syncNow')}</PillButton></View>
    </> : null}
    {error || autoSyncState?.status === 'TransientError' ? <Text accessibilityRole="alert" style={[styles.label, { color: tokens.statusBadText }]}>{error ?? t('calendar.autoSync.syncFailed')}</Text> : null}
  </View>
}

const styles = StyleSheet.create({
  container: { minWidth: 0, gap: 8 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  timestamp: { gap: 4 },
  meta: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  date: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, fontVariant: ['tabular-nums'] },
  switchLine: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, alignSelf: 'center', fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  action: { alignItems: 'flex-end' },
})
