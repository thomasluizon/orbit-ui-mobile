'use client'

import { useTranslations } from 'next-intl'
import type { WebPushPermission, WebPushPreferenceStatus } from '@orbit/shared/utils'
import { RowList } from '@/components/ui/row-list'
import { Switch } from '@/components/ui/switch'
import { getPushStatusMessageKey, getPushStatusTone } from '@/hooks/use-push-notification-preferences'

export function PushDevicesRow({
  count,
  max,
  currentDeviceRegistered,
  supported,
  loading,
  error,
  permission,
  status,
  onToggle,
}: Readonly<{
  count: number | undefined
  max: number | undefined
  currentDeviceRegistered: boolean
  supported: boolean
  loading: boolean
  error: boolean
  permission: WebPushPermission
  status: WebPushPreferenceStatus
  onToggle: () => void
}>) {
  const t = useTranslations()
  const canEnable = count !== undefined && max !== undefined && count < max
  const disabled = loading || error || !supported || (!currentDeviceRegistered && !canEnable)
  return (
    <RowList>
      <div className="flex min-h-11 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-base text-[var(--fg-1)]">{t('profile.settingsRows.devices')}</span>
        {count !== undefined && max !== undefined ? (
          <span className="shrink-0 font-mono text-xs text-[var(--fg-3)]">{count} {t('profile.settingsRows.of')} {max}</span>
        ) : null}
      </div>
      <div className="flex min-h-11 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-sm text-[var(--fg-2)]">{t('profile.settingsRows.currentDevice')}</span>
        <fieldset disabled={disabled} className="m-0 border-0 p-0">
          <Switch checked={currentDeviceRegistered} onChange={onToggle} label={t('profile.settingsRows.currentDevice')} />
        </fieldset>
      </div>
      {error ? <p role="status" className="m-0 px-4 pb-3 text-sm text-[var(--status-bad-text)]">{t('profile.settingsRows.devicesUnavailable')}</p> : null}
      {!error && !currentDeviceRegistered && !canEnable && count !== undefined ? (
        <p role="status" className="m-0 px-4 pb-3 text-sm text-[var(--fg-3)]">{t('profile.settingsRows.pushDeviceLimit')}</p>
      ) : null}
      {['unsupported', 'denied', 'sync-failed', 'requesting'].includes(status) ? (
        <p role="status" className={`m-0 px-4 pb-3 text-sm ${getPushStatusTone(status)}`}>
          {t(getPushStatusMessageKey(status, permission))}
        </p>
      ) : null}
    </RowList>
  )
}
