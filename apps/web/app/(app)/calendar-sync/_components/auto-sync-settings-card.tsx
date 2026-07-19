'use client'

import { useMemo, useState } from 'react'
import {
  Loader2,
  CalendarDays,
  AlertTriangle,
  RefreshCw,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
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

export function AutoSyncSettingsCard() {
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
      <SectionLabel bottom={10}>{t('calendar.autoSync.title')}</SectionLabel>
      <div style={{ padding: '0 20px' }}>
        <div
          className="flex items-center"
          style={{
            gap: 14,
            padding: '16px 18px',
            borderRadius: 16,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-flex justify-center shrink-0"
            style={{ width: 26 }}
          >
            <CalendarDays size={22} strokeWidth={1.8} color="var(--fg-1)" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 400,
                lineHeight: 1.25,
                color: 'var(--fg-1)',
              }}
            >
              {t('calendar.title')}
            </div>
            <div
              className="flex items-center"
              style={{
                gap: 6,
                marginTop: 4,
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: 'var(--fg-3)',
              }}
            >
              {isLoading && <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />}
              <span>{statusMeta}</span>
            </div>
          </div>
          <Switch
            on={enabled}
            onToggle={() => void handleToggle()}
            ariaLabel={t('calendar.autoSync.toggleLabel')}
            disabled={toggleDisabled}
          />
        </div>
      </div>
      <SettingsDescription>{t('calendar.autoSync.description')}</SettingsDescription>

      {!isLoading && hasConnection && (
        <div className="flex justify-end" style={{ padding: '0 20px 6px' }}>
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
        </div>
      )}

      {showReconnect && (
        <div
          style={{
            padding: '6px 20px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div className="flex items-start gap-2 text-[var(--status-overdue-text)]">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {t('calendar.autoSync.reconnectTitle')}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  marginTop: 4,
                  color: 'var(--fg-3)',
                  lineHeight: 1.5,
                }}
              >
                {t('calendar.autoSync.reconnectBody')}
              </p>
            </div>
          </div>
          <QuietActionButton onClick={() => void handleReconnect()} disabled={isConnecting} tone="warning">
            {t('calendar.autoSync.reconnectCta')}
          </QuietActionButton>
        </div>
      )}
    </>
  )
}
