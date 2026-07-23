'use client'

import { useMemo, useState } from 'react'
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { Switch } from '@/components/ui/settings-row'
import { useOffline } from '@/hooks/use-offline'
import {
  useCalendarAutoSyncState,
  useRunCalendarSyncNow,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import {
  formatCalendarAutoSyncLastSynced,
  getFriendlyErrorMessage,
  isCalendarAutoSyncStatusReconnectRequired,
} from '@orbit/shared/utils'
import { toast } from 'sonner'
import { QuietActionButton } from './quiet-action-button'
import { connectGoogle } from './connect-google'

/**
 * Auto-sync configuration band: a section head that owns the switch and the explanation,
 * over a single quiet status strip pairing "when it last ran" with the action that runs it.
 * Deliberately card-less so it shares one rhythm with the Calendars group below it.
 */
export function AutoSyncSection() {
  const t = useTranslations()
  const { data: state, isLoading } = useCalendarAutoSyncState()
  const setAutoSync = useSetCalendarAutoSync()
  const runSyncNow = useRunCalendarSyncNow()
  const { isOnline } = useOffline()
  const [isConnecting, setIsConnecting] = useState(false)

  const lastSyncedLabel = useMemo(
    () =>
      formatCalendarAutoSyncLastSynced(
        state?.lastSyncedAt ?? null,
        (key, values) => t(key, values),
      ),
    [state?.lastSyncedAt, t],
  )

  const showReconnect = isCalendarAutoSyncStatusReconnectRequired(state?.status)
  const hasConnection = state?.hasGoogleConnection === true
  const toggleDisabled = !hasConnection || setAutoSync.isPending || !isOnline
  const enabled = state?.enabled ?? false

  async function handleToggle() {
    if (!isOnline) {
      toast.error(t('errors.offline'))
      return
    }
    if (toggleDisabled) return
    const next = !enabled
    try {
      await setAutoSync.mutateAsync({ enabled: next })
      toast.success(next ? t('calendar.autoSync.enableSuccess') : t('calendar.autoSync.disableSuccess'))
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.autoSync.syncFailed', 'generic'))
    }
  }

  async function handleSyncNow() {
    if (!isOnline) {
      toast.error(t('errors.offline'))
      return
    }
    try {
      await runSyncNow.mutateAsync()
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.autoSync.syncFailed', 'generic'))
    }
  }

  async function handleReconnect() {
    if (!isOnline || isConnecting) return
    setIsConnecting(true)
    try {
      await connectGoogle()
    } catch {
      toast.error(t('auth.googleError'))
    } finally {
      setIsConnecting(false)
    }
  }

  const statusMeta = (() => {
    if (isLoading) return t('calendar.fetchingEvents')
    if (!hasConnection) return t('calendar.autoSync.connectGoogleFirst')
    return lastSyncedLabel
  })()

  return (
    <>
      <SectionLabel
        description={t('calendar.autoSync.description')}
        trailing={
          <Switch
            on={enabled}
            onToggle={() => void handleToggle()}
            ariaLabel={t('calendar.autoSync.toggleLabel')}
            disabled={toggleDisabled}
          />
        }
      >
        {t('calendar.autoSync.title')}
      </SectionLabel>

      <div className="flex min-w-0 items-center justify-between px-5" style={{ gap: 12 }}>
        <span className="t-meta inline-flex min-w-0 items-center" style={{ gap: 8 }}>
          {isLoading && <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />}
          <span className="truncate">{statusMeta}</span>
        </span>
        {!isLoading && hasConnection && (
          <QuietActionButton onClick={() => void handleSyncNow()} disabled={runSyncNow.isPending}>
            {runSyncNow.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('calendar.autoSync.syncNowRunning')}
              </>
            ) : (
              <>
                <RefreshCw className="size-3" aria-hidden />
                {t('calendar.autoSync.syncNow')}
              </>
            )}
          </QuietActionButton>
        )}
      </div>

      {showReconnect && (
        <div className="flex items-start px-5" style={{ gap: 8, paddingTop: 12 }}>
          <AlertTriangle
            className="size-4 shrink-0 text-[var(--status-overdue-text)]"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col items-start" style={{ gap: 8 }}>
            <p
              className="t-secondary"
              style={{ color: 'var(--status-overdue-text)', fontWeight: 500 }}
            >
              {t('calendar.autoSync.reconnectTitle')}
            </p>
            <p className="t-secondary max-w-[65ch] text-pretty">
              {t('calendar.autoSync.reconnectBody')}
            </p>
            <QuietActionButton
              onClick={() => void handleReconnect()}
              disabled={isConnecting}
              tone="warning"
            >
              {t('calendar.autoSync.reconnectCta')}
            </QuietActionButton>
          </div>
        </div>
      )}
    </>
  )
}
