'use client'

import { useTranslations } from 'next-intl'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { formatCalendarSyncTimestamp, getFriendlyErrorMessage, isCalendarSyncConnectionActive } from '@orbit/shared/utils'
import { Switch } from '@/components/ui/switch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useOffline } from '@/hooks/use-offline'
import { PillButton } from '@/components/ui/pill-button'

interface CalendarSyncBoundaryProps {
  locale: string
  timeZone?: string | null
  uses24HourClock?: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onSyncNow: () => Promise<void>
}

export function CalendarSyncBoundary({ autoSyncState, onAutoSyncChange, onSyncNow, locale, timeZone, uses24HourClock }: Readonly<CalendarSyncBoundaryProps>) {
  const t = useTranslations()
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

  return <div className="flex min-w-0 flex-col gap-2" data-calendar-sync-line>
    <p className="text-sm text-[var(--fg-2)]">{t(connected ? 'calendar.dayDetail.googleConnected' : 'calendar.autoSync.reconnectTitle')}</p>
    <div className="flex flex-col gap-1 text-xs text-[var(--fg-3)]">
      <span>{t('calendar.dayDetail.lastSyncedLabel')}</span>
      <span className="font-mono tabular-nums">{lastSynced ?? t('calendar.autoSync.lastSyncedNever')}</span>
    </div>
    {connected ? <>
      <div className="flex min-h-12 items-start justify-between gap-3">
        <span className="min-w-0 self-center text-sm text-[var(--fg-2)]">{t('calendar.dayDetail.autoSync')}</span>
        <Switch checked={autoSyncState?.enabled ?? false} disabled={!isOnline || pendingAction !== null} onChange={(enabled) => void runAction('toggle', () => onAutoSyncChange(enabled))} label={t('calendar.dayDetail.autoSync')} />
      </div>
      <div className="self-end"><PillButton variant="ghost" size="sm" disabled={!isOnline || pendingAction !== null} loading={pendingAction === 'sync'} onClick={() => void runAction('sync', onSyncNow)}>{t('calendar.autoSync.syncNow')}</PillButton></div>
    </> : null}
    <p role="alert" className="m-0 text-sm text-[var(--status-bad-text)]">{error ?? (autoSyncState?.status === 'TransientError' ? t('calendar.autoSync.syncFailed') : '')}</p>
  </div>
}
