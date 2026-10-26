'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ActionRow } from '@/components/ui/action-row'
import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { useTranslations } from 'next-intl'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { PillButton } from '@/components/ui/pill-button'
import { DesktopUpdateNotice } from '@/components/desktop-update-notice'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'

export function UpdateAvailableBanner({ modalId, active = true, inset = true }: Readonly<{ modalId?: string; active?: boolean; inset?: boolean | 'inline' }>) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { queueMicrotask(() => setMounted(true)) }, [])
  const { upgradeRequired, reloadReason, updateDismissed } = useVersionGateStore()
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  const ownsNotice = modalId ? activeModalId === modalId : !activeModalId
  const eligible = mounted && active && ownsNotice
  const desktopNotice = useDesktopUpdateStore(state => state.notice)
  const desktopVisible = eligible && desktopNotice !== null && reloadReason === null
  const visible = eligible && (reloadReason !== null || (upgradeRequired && !updateDismissed))
  const showNotice = visible || desktopVisible
  const insetClassName = inset === 'inline' ? 'px-4' : 'p-4'
  return <div role="status" data-update-live-region="" data-update-banner={showNotice ? '' : undefined} className={showNotice && inset ? insetClassName : undefined}>
    {desktopVisible ? <DesktopUpdateNotice /> : visible ? <VersionUpdateNotice /> : null}
  </div>
}

function VersionUpdateNotice() {
  const t = useTranslations()
  const { minVersion, reloadReason, dismissUpdate } = useVersionGateStore()
  const reloadMessage = reloadReason === 'accountChanged'
    ? t('errors.api.accountChanged')
    : reloadReason === 'appUpdated' ? t('errors.api.appUpdated') : null
  return <div className="rounded-[var(--r-card)] bg-[var(--bg-elev)] p-4 text-[var(--fg-1)]"><ActionRow>
    <div className="min-w-0 flex-1 basis-[240px]">
      <p className="text-sm font-medium leading-[1.4]" translate={reloadMessage ? undefined : 'no'}>
        {reloadMessage ?? t('forceUpdate.banner')}
      </p>
      {!reloadReason && minVersion && <p className="text-[14px] leading-[1.5] text-[var(--fg-3)]">
        {t('forceUpdate.bannerVersion', { minVersion })}
      </p>}
    </div>
    {!reloadReason && <PillButton size="sm" variant="ghost" onClick={dismissUpdate}>{t('versionUpdate.laterCta')}</PillButton>}
    <IconButton label={reloadReason ? t('errors.api.reload') : t('forceUpdate.refresh')} onClick={() => globalThis.location.reload()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  </ActionRow></div>
}
