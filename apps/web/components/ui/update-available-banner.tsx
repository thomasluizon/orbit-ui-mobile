'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { PillButton } from '@/components/ui/pill-button'

export function UpdateAvailableBanner() {
  const t = useTranslations()
  const { upgradeRequired, minVersion } = useVersionGateStore()
  const [dismissed, setDismissed] = useState(false)
  if (!upgradeRequired || dismissed) return null
  return (
    <div role="status" data-update-banner="" className="flex flex-wrap items-center gap-3 bg-[var(--bg-well)] px-6 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-[17px] font-medium leading-[1.4]" translate="no">{t('forceUpdate.banner')}</p>
        <p className="text-[14px] leading-[1.5] text-[var(--fg-3)]">
          {minVersion ? t('forceUpdate.bannerVersion', { minVersion }) : t('forceUpdate.bannerDescription')}
        </p>
      </div>
      <PillButton size="sm" variant="secondary" onClick={() => globalThis.location.reload()}>{t('forceUpdate.refresh')}</PillButton>
      <PillButton size="sm" variant="ghost" onClick={() => setDismissed(true)}>{t('versionUpdate.laterCta')}</PillButton>
    </div>
  )
}
