'use client'

import { useRef, type Ref } from 'react'
import { useTranslations } from 'next-intl'
import { ActionRow } from '@/components/ui/action-row'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup } from '@/components/ui/settings-group'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'

/** The trial expired notice as a centred dialog: Orbit in Parado, the heading, the paused features and the two actions. Orbit is never Feliz here. */
export function TrialExpiredDialog({ sheetRef, pausedFeatures, savingsPercent, onSeePlans, onContinueFree, onClose }: Readonly<{
  sheetRef: Ref<SheetHandle>
  pausedFeatures: readonly string[]
  /** The yearly saving of the plans read. Absent until the read answers. */
  savingsPercent: number | undefined
  onSeePlans: () => void
  onContinueFree: () => void
  onClose: () => void
}>) {
  const t = useTranslations()
  const primaryRef = useRef<HTMLButtonElement>(null)
  return (
    <Sheet ref={sheetRef} open centred accessibleTitle={t('trial.expired.heading')} accessibleDescription={t('trial.expired.subtitleQuiet')} initialFocus={primaryRef} onClose={onClose}>
      <div data-trial-expired-dialog="" data-orbit-state="parado" className="flex flex-col items-center gap-6 px-6 pb-6 pt-2">
        <span aria-hidden="true"><OrbitMascot size={96} state="parado" /></span>
        <div className="flex flex-col gap-2 text-center">
          <p className="t-eyebrow m-0">{t('trial.expired.eyebrow')}</p>
          <p aria-hidden="true" className="m-0 font-display text-[28px] leading-[1.18] text-[var(--fg-1)]">{t('trial.expired.heading')}</p>
          <p aria-hidden="true" className="m-0 text-pretty text-base leading-[1.55] text-[var(--fg-2)]">{t('trial.expired.subtitleQuiet')}</p>
          {savingsPercent === undefined ? null : (
            <p className="m-0 font-mono text-xs tabular-nums text-[var(--fg-3)]">{t('trial.expired.savings', { percent: savingsPercent })}</p>
          )}
        </div>
        <div className="w-full">
          <SettingsGroup>
            {pausedFeatures.map((featureKey) => (
              <ListRow readOnly textMode="label" key={featureKey} title={t(featureKey)} description={t('trial.expired.paused')} />
            ))}
          </SettingsGroup>
        </div>
        <ActionRow align="center">
          <div className="w-full"><PillButton buttonRef={primaryRef} onClick={onSeePlans}>{t('trial.expired.subscribe')}</PillButton></div>
          <PillButton variant="ghost" size="sm" onClick={onContinueFree}>{t('trial.expired.continueFree')}</PillButton>
        </ActionRow>
      </div>
    </Sheet>
  )
}
