'use client'

import { useTranslations } from 'next-intl'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage, isPayGateError } from '@orbit/shared/utils'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useOffline } from '@/hooks/use-offline'
import { ListRow } from '@/components/ui/list-row'
import { RefreshCw } from '@/components/ui/icons'

interface CalendarSyncBoundaryProps {
  isConnected: boolean
  hasProAccess: boolean
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
}

export function CalendarSyncBoundary({ isConnected, hasProAccess, autoSyncState, onAutoSyncChange, onSyncNow, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const t = useTranslations()
  const { isOnline } = useOffline()
  const [pendingAction, setPendingAction] = useAccountScopedState<'toggle' | 'sync' | null>(null)
  const [error, setError] = useAccountScopedState<string | null>(null)
  const [proRequired, setProRequired] = useAccountScopedState(false)
  const lastSynced = formatCalendarSyncTimestamp(autoSyncState?.lastSyncedAt ?? null, locale, timeZone, uses24HourClock)
  const gated = !hasProAccess || proRequired
  const showControls = isConnected && !gated
  const syncUnavailable = !isOnline || pendingAction !== null

  async function runAction(kind: 'toggle' | 'sync', action: () => Promise<void>) {
    if (gated || pendingAction || !isOnline) return
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

  return <div className="flex min-w-0 flex-col gap-2" data-calendar-sync-line>
    <div className="flex min-w-0 items-start gap-3" data-calendar-connection-row>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3">
        <span className="text-sm text-[var(--fg-2)]">{t(isConnected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-2)]" title={t('calendar.dayDetail.lastSyncedLabel')}>{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</span>
      </div>
      {showControls ? <button type="button" aria-label={t('calendar.autoSync.syncNow')} aria-busy={pendingAction === 'sync' || undefined} disabled={syncUnavailable} onClick={() => void runAction('sync', onSyncNow)} className="icon-btn touch-target shrink-0 text-[var(--fg-2)] disabled:opacity-50"><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></button> : null}
    </div>
    {showControls ? <ListRow placement="column" title={t('calendar.autoSync.automaticImport')} description={t('calendar.autoSync.automaticImportDescription')} disabled={syncUnavailable} toggle={{ checked: autoSyncState?.enabled ?? false, pending: pendingAction === 'toggle', onChange: (enabled) => void runAction('toggle', () => onAutoSyncChange(enabled)) }} /> : null}
    <p role="status" hidden={!gated && pendingAction !== 'sync'} className="m-0 text-sm text-[var(--fg-2)]">{gated ? t('calendar.autoSync.proRequired') : pendingAction === 'sync' ? t('calendar.autoSync.syncing') : ''}</p>
    <p role="alert" hidden={gated || (!error && autoSyncState?.status !== 'TransientError')} className="m-0 text-sm text-[var(--status-bad-text)]">{gated ? '' : error ?? (autoSyncState?.status === 'TransientError' ? t('calendar.autoSync.syncFailed') : '')}</p>
  </div>
}
