'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import {
  getCalendarSyncClockValue,
  isCalendarSyncConnectionActive,
} from '@orbit/shared/utils'
import { RefreshCw } from '@/components/ui/icons'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'

interface CalendarSyncBoundaryProps {
  hasProAccess: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  displayTime: (time: string) => string
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onOpenPro: () => void
  wide?: boolean
}

export function CalendarSyncBoundary({
  hasProAccess,
  autoSyncState,
  displayTime,
  onAutoSyncChange,
  onOpenPro,
  wide = false,
}: Readonly<CalendarSyncBoundaryProps>) {
  const t = useTranslations()
  const [isSaving, setIsSaving] = useState(false)

  if (!hasProAccess) {
    return (
      <CapacityNotice
        message={t('calendar.dayDetail.syncBoundary')}
        body={t('calendar.dayDetail.syncBoundaryBody')}
        action={(
          <PillButton
            size="sm"
            variant={wide ? 'secondary' : 'primary'}
            onClick={onOpenPro}
          >
            {t('calendar.dayDetail.viewPro')}
          </PillButton>
        )}
      />
    )
  }

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
