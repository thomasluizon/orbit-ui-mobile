'use client'

import { useState } from 'react'
import { ListRow } from '@/components/ui/list-row'
import { useTranslations } from 'next-intl'
import type { WebPushPermission } from '@orbit/shared/utils'
import { RowList } from '@/components/ui/row-list'
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
  const [limitReached, setLimitReached] = useState(false)
  const canEnable = count !== undefined && max !== undefined && count < max
  const showLimit = limitReached && !error && !currentDeviceRegistered && !canEnable
  const checking = status === 'checking'
  const disabled = checking || loading || error || !supported || count === undefined || max === undefined
  return (
    <div aria-busy={loading || checking}>
    <RowList>
      <div>
      <ListRow wrapTitle title={t('profile.settingsRows.alertsOnThisDevice')} disabled={disabled} chevron={false} toggle={{ checked: currentDeviceRegistered, pending: checking, onChange: () => {
        if (!currentDeviceRegistered && !canEnable) { setLimitReached(true); return }
        setLimitReached(false)
        onToggle()
      } }} />
      {loading ? <p role="status" aria-label={t('profile.loading')} className="m-0 px-4 pb-3 text-sm text-[var(--fg-3)]">{t('profile.loading')}</p> : null}
      {error ? <div className="flex items-center gap-3 px-4 pb-3">
        <p role="alert" className="m-0 flex-1 text-sm text-[var(--status-bad-text)]">{t('profile.settingsRows.devicesUnavailable')}</p>
        <PillButton variant="ghost" size="sm" iconOnly label={t('common.retry')} onClick={onRetry}>
          <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
        </PillButton>
      </div> : null}
      <p role="status" className={`m-0 text-sm text-[var(--fg-3)]${showLimit ? ' px-4 pb-3' : ''}`}>{showLimit ? t('profile.settingsRows.pushDeviceLimit') : ''}</p>
      <PushDeviceStatus status={status} permission={permission} />
      </div>
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
