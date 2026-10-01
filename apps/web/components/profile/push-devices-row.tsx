'use client'

import { useTranslations } from 'next-intl'
import type { WebPushPermission } from '@orbit/shared/utils'
import { RowList } from '@/components/ui/row-list'
import { Switch } from '@/components/ui/switch'
import { PillButton } from '@/components/ui/pill-button'
import { RotateCcw } from '@/components/ui/icons'
import { getPushStatusMessageKey, getPushStatusTone, type PushPreferenceStatus } from '@/hooks/use-push-notification-preferences'

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
  onRetry,
}: Readonly<{
  count: number | undefined
  max: number | undefined
  currentDeviceRegistered: boolean
  supported: boolean
  loading: boolean
  error: boolean
  permission: WebPushPermission
  status: PushPreferenceStatus
  onToggle: () => void
  onRetry: () => void
}>) {
  const t = useTranslations()
  const canEnable = count !== undefined && max !== undefined && count < max
  const checking = status === 'checking'
  const disabled = checking || loading || error || !supported || (!currentDeviceRegistered && !canEnable)
  return (
    <div aria-busy={loading || checking}>
    <RowList>
      <div className="flex min-h-11 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-[length:var(--fs-md)] text-[var(--fg-1)]">{t('profile.settingsRows.devices')}</span>
        <span className="inline-flex min-w-16 shrink-0 justify-end font-mono text-xs text-[var(--fg-3)]">
          {count !== undefined && max !== undefined
            ? t('profile.settingsRows.devicesCount', { count, max })
            : loading ? <span role="status" aria-label={t('profile.loading')} className="inline-block h-4 w-12 rounded-lg bg-[var(--bg-well)]" /> : null}
        </span>
      </div>
      <div className="flex min-h-11 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-sm text-[var(--fg-2)]">{t('profile.settingsRows.currentDevice')}</span>
        <fieldset disabled={disabled} aria-hidden={checking || undefined} className={`m-0 border-0 p-0${checking ? ' invisible' : ''}`}>
          <Switch checked={currentDeviceRegistered} onChange={onToggle} label={t('profile.settingsRows.alertsOnThisDevice')} />
        </fieldset>
      </div>
      {error ? <div className="flex items-center gap-3 px-4 pb-3">
        <p role="alert" className="m-0 flex-1 text-sm text-[var(--status-bad-text)]">{t('profile.settingsRows.devicesUnavailable')}</p>
        <PillButton variant="ghost" size="sm" iconOnly label={t('common.retry')} onClick={onRetry}>
          <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
        </PillButton>
      </div> : null}
      {!error && !currentDeviceRegistered && !canEnable && count !== undefined ? (
        <p role="status" className="m-0 px-4 pb-3 text-sm text-[var(--fg-3)]">{t('profile.settingsRows.pushDeviceLimit')}</p>
      ) : null}
      <PushDeviceStatus status={status} permission={permission} />
    </RowList>
    </div>
  )
}

function PushDeviceStatus({ status, permission }: Readonly<{
  status: PushPreferenceStatus
  permission: WebPushPermission
}>) {
  const t = useTranslations()
  const checking = status === 'checking'
  if (!checking && !['unsupported', 'denied', 'sync-failed', 'requesting'].includes(status)) return null
  return (
    <p role="status" data-testid="push-status" className={`m-0 px-4 pb-3 text-sm ${checking ? '' : getPushStatusTone(status)}`}>
      {checking ? '\u00A0' : t(status === 'unsupported' ? 'settings.notifications.unsupported' : getPushStatusMessageKey(status, permission))}
    </p>
  )
}
