'use client'

import { useTranslations } from 'next-intl'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import {
  getCalendarSyncClockValue,
  isCalendarSyncConnectionActive,
} from '@orbit/shared/utils'
import { RefreshCw } from '@/components/ui/icons'
import { Switch } from '@/components/ui/switch'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface CalendarSyncBoundaryProps {
  autoSyncState: CalendarAutoSyncState | undefined
  displayTime: (time: string) => string
  onAutoSyncChange: (enabled: boolean) => Promise<void>
}

export function CalendarSyncBoundary({
  autoSyncState,
  displayTime,
  onAutoSyncChange,
}: Readonly<CalendarSyncBoundaryProps>) {
  const t = useTranslations()
  const [isSaving, setIsSaving] = useAccountScopedState(false)

  const connected = isCalendarSyncConnectionActive(
    autoSyncState?.hasGoogleConnection ?? false,
    autoSyncState?.status ?? 'Idle',
  )
  const connectionLabel = connected
    ? t('calendar.dayDetail.googleConnected')
    : t('calendar.autoSync.reconnectTitle')
  const clockValue = getCalendarSyncClockValue(autoSyncState?.lastSyncedAt ?? null)
  const lastSynced = clockValue
    ? t('calendar.dayDetail.lastSynced', { time: displayTime(clockValue) })
    : t('calendar.autoSync.lastSyncedNever')

  const handleAutoSyncChange = async (enabled: boolean) => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await onAutoSyncChange(enabled)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--r-well)] bg-[var(--bg-well)] p-3"
      data-calendar-sync-line
    >
      <div className="flex min-w-0 items-center gap-2">
        <RefreshCw size={16} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-[var(--fg-2)]">
          {connectionLabel}
        </p>
        <p className="shrink-0 font-mono text-xs tabular-nums text-[var(--fg-3)]">
          {lastSynced}
        </p>
      </div>
      {connected ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm text-[var(--fg-2)]">
            {t('calendar.dayDetail.autoSync')}
          </span>
          <Switch
            checked={autoSyncState?.enabled ?? false}
            onChange={(enabled) => void handleAutoSyncChange(enabled)}
            label={t('calendar.dayDetail.autoSync')}
          />
        </div>
      ) : null}
    </div>
  )
}
