import { SPACING } from '@orbit/shared/theme'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage, isPayGateError } from '@orbit/shared/utils'
import { ListRow } from '@/components/ui/list-row'
import { RefreshCw } from '@/components/ui/icons'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { useOffline } from '@/hooks/use-offline'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { AppTokensV2 } from '@/lib/theme'

interface CalendarSyncBoundaryProps {
  isConnected: boolean
  hasProAccess: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
  t: TFunction
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  tokens: AppTokensV2
}

export function CalendarSyncBoundary({ isConnected, hasProAccess, autoSyncState, onAutoSyncChange, onSyncNow, tokens, t, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const { isOnline } = useOffline()
  const [pendingAction, setPendingAction] = useAccountScopedState<'toggle' | 'sync' | null>(null)
  const [error, setError] = useAccountScopedState<string | null>(null)
  const [proRequired, setProRequired] = useAccountScopedState(false)
  const lastSynced = formatCalendarSyncTimestamp(autoSyncState?.lastSyncedAt ?? null, locale, timeZone, uses24HourClock)
  const gated = !hasProAccess || proRequired
  const showControls = isConnected && !gated
  const syncUnavailable = !isOnline || pendingAction !== null

  async function runAction(kind: 'toggle' | 'sync', action: () => Promise<void>) {
    if (gated || syncUnavailable) return
    const generation = getAccountGeneration()
    setPendingAction(kind)
    setError(null)
    try { await action() }
    catch (failure: unknown) {
      if (generation !== getAccountGeneration()) return
      if (isPayGateError(failure)) setProRequired(true)
      else setError(getFriendlyErrorMessage(failure, t, 'calendar.autoSync.syncFailed', 'textless'))
    } finally {
      if (generation === getAccountGeneration()) setPendingAction(null)
    }
  }


  return <View style={styles.container} testID="calendar-sync-line">
    <View style={styles.connection} testID="calendar-connection-row">
      <View style={styles.summary}>
        <Text style={[styles.label, { color: tokens.fg2 }]}>{t(isConnected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</Text>
        <Text accessibilityHint={t('calendar.dayDetail.lastSyncedLabel')} style={[styles.date, { color: tokens.fg2 }]}>{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</Text>
      </View>
      {showControls ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={t('calendar.autoSync.syncNow')} accessibilityState={{ disabled: syncUnavailable, busy: pendingAction === 'sync' }} disabled={syncUnavailable} onPress={() => void runAction('sync', onSyncNow)} style={({ pressed }) => [styles.refresh, { backgroundColor: pressed ? tokens.bgHover : 'transparent', opacity: syncUnavailable ? 0.5 : 1 }]}>{pendingAction === 'sync' ? <ActivityIndicator size="small" color={tokens.fg2} /> : <RefreshCw size={20} strokeWidth={1.5} color={tokens.fg2} accessible={false} />}</InsetFocusPressable> : null}
    </View>
    {showControls ? <ListRow placement="column" title={t('calendar.autoSync.automaticImport')} description={t('calendar.autoSync.automaticImportDescription')} disabled={syncUnavailable} toggle={{ checked: autoSyncState?.enabled ?? false, pending: pendingAction === 'toggle', onChange: (enabled) => void runAction('toggle', () => onAutoSyncChange(enabled)) }} /> : null}
    <Text accessibilityLiveRegion="polite" style={[styles.label, { color: tokens.fg2, display: gated || pendingAction === 'sync' ? undefined : 'none' }]}>{gated ? t('calendar.autoSync.proRequired') : pendingAction === 'sync' ? t('calendar.autoSync.syncing') : ''}</Text>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.label, { color: tokens.statusBadText, display: gated || (!error && autoSyncState?.status !== 'TransientError') ? 'none' : undefined }]}>{gated ? '' : error ?? (autoSyncState?.status === 'TransientError' ? t('calendar.autoSync.syncFailed') : '')}</Text>
  </View>
}

const styles = StyleSheet.create({
  container: { minWidth: 0, gap: 8 },
  connection: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  summary: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, paddingVertical: SPACING.s12 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  date: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, fontVariant: ['tabular-nums'] },
  refresh: { minHeight: 48, minWidth: 48, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
