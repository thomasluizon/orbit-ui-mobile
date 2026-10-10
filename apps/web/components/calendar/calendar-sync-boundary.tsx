'use client'

import { ListRow } from '@/components/ui/list-row'

import { useTranslations } from 'next-intl'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useOffline } from '@/hooks/use-offline'
import { PillButton } from '@/components/ui/pill-button'

interface CalendarSyncBoundaryProps {
  isConnected: boolean
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
}

export function CalendarSyncBoundary({ isConnected, autoSyncState, onAutoSyncChange, onSyncNow, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const t = useTranslations()
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

  return <div className="flex min-w-0 flex-col gap-2" data-calendar-sync-line>
    <p className="text-sm text-[var(--fg-2)]">{t(isConnected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</p>
    <div className="flex flex-col gap-1 text-xs text-[var(--fg-3)]">
      <span>{t('calendar.dayDetail.lastSyncedLabel')}</span>
      <span className="font-mono tabular-nums">{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</span>
    </div>
    {isConnected ? <>
      {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Calendario syncAuto controls this label under D42. */}
      <ListRow title={t('calendar.dayDetail.autoSync')} disabled={!isOnline || pendingAction !== null} toggle={{ checked: autoSyncState?.enabled ?? false, onChange: (enabled) => void runAction('toggle', () => onAutoSyncChange(enabled)) }} />
      <div className="self-end"><PillButton variant="ghost" size="sm" disabled={!isOnline || pendingAction !== null} loading={pendingAction === 'sync'} onClick={() => void runAction('sync', onSyncNow)}>{t('calendar.autoSync.syncNow')}</PillButton></div>
    </> : null}
    <p role="alert" className="m-0 text-sm text-[var(--status-bad-text)]">{error ?? (autoSyncState?.status === 'TransientError' ? t('calendar.autoSync.syncFailed') : '')}</p>
  </div>
}
