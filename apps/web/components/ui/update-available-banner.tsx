'use client'

import { ActionRow } from '@/components/ui/action-row'

import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { useTranslations } from 'next-intl'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { PillButton } from '@/components/ui/pill-button'

export function UpdateAvailableBanner({ modalId, active = true }: Readonly<{ modalId?: string; active?: boolean }>) {
  const t = useTranslations()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { queueMicrotask(() => setMounted(true)) }, [])
  const { upgradeRequired, minVersion, reloadReason, updateDismissed, dismissUpdate } = useVersionGateStore()
  const activeModalId = useUIStore((state) => [...state.openOverlayIds].reverse().find((id) => id.startsWith('modal:')))
  const ownsNotice = modalId ? activeModalId === modalId : !activeModalId
  const visible = mounted && active && ownsNotice && (reloadReason !== null || (upgradeRequired && !updateDismissed))
  const reloadMessage = reloadReason === 'accountChanged'
    ? t('errors.api.accountChanged')
    : reloadReason === 'appUpdated' ? t('errors.api.appUpdated') : null
  return (
    <div role="status" data-update-live-region="" data-update-banner={visible ? '' : undefined}>
      {visible ? (
        <div className="flex flex-wrap items-center gap-3 bg-[var(--bg-elev)] px-6 py-3 shadow-[inset_0_-1px_0_var(--hairline)]"><ActionRow>
          <div className="min-w-0 flex-1 basis-[240px]">
            <p className="text-[17px] font-medium leading-[1.4]" translate={reloadMessage ? undefined : 'no'}>
              {reloadMessage ?? t('forceUpdate.banner')}
            </p>
            {!reloadReason && minVersion && <p className="text-[14px] leading-[1.5] text-[var(--fg-3)]">
              {t('forceUpdate.bannerVersion', { minVersion })}
            </p>}
          </div>
          {!reloadReason && <PillButton size="sm" variant="ghost" onClick={dismissUpdate}>{t('versionUpdate.laterCta')}</PillButton>}
          <PillButton size="sm" variant="secondary" onClick={() => globalThis.location.reload()}>
            {reloadReason ? t('errors.api.reload') : t('forceUpdate.refresh')}
          </PillButton>
        </ActionRow></div>
      ) : null}
    </div>
  )
}
