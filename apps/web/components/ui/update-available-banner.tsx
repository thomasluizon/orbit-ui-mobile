'use client'

import { useTranslations } from 'next-intl'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { PillButton } from '@/components/ui/pill-button'

export function UpdateAvailableBanner() {
  const t = useTranslations()
  const { upgradeRequired, minVersion, reloadReason, updateDismissed, dismissUpdate } = useVersionGateStore()
  if (!reloadReason && (!upgradeRequired || updateDismissed)) return null
  const reloadMessage = reloadReason === 'accountChanged'
    ? t('errors.api.accountChanged')
    : reloadReason === 'appUpdated' ? t('errors.api.appUpdated') : null
  return (
    <div role="status" data-update-banner="" className="flex flex-wrap items-center gap-3 bg-[var(--bg-well)] px-6 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-[17px] font-medium leading-[1.4]" translate={reloadMessage ? undefined : 'no'}>
          {reloadMessage ?? t('forceUpdate.banner')}
        </p>
        {!reloadReason && <p className="text-[14px] leading-[1.5] text-[var(--fg-3)]">
          {minVersion ? t('forceUpdate.bannerVersion', { minVersion }) : t('forceUpdate.bannerDescription')}
        </p>}
      </div>
      <PillButton size="sm" variant="secondary" onClick={() => globalThis.location.reload()}>
        {reloadReason ? t('errors.api.reload') : t('forceUpdate.refresh')}
      </PillButton>
      {!reloadReason && <PillButton size="sm" variant="ghost" onClick={dismissUpdate}>{t('versionUpdate.laterCta')}</PillButton>}
    </div>
  )
}
