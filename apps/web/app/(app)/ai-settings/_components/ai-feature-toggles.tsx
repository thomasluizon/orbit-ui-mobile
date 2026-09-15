'use client'

import { BellRing, Lock, Satellite } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { AstraSettingsSwitch } from '@/components/profile/astra-settings-controller'

interface AiFeatureTogglesProps {
  hasProAccess: boolean
  aiSummaryEnabled: boolean
  proactiveAstraEnabled: boolean
  summaryPending: boolean
  proactivePending: boolean
  onToggleSummary: () => void
  onToggleProactive: () => void
  onUpgrade: () => void
}

export function AiFeatureToggles({
  hasProAccess,
  aiSummaryEnabled,
  proactiveAstraEnabled,
  summaryPending,
  proactivePending,
  onToggleSummary,
  onToggleProactive,
  onUpgrade,
}: Readonly<AiFeatureTogglesProps>) {
  const t = useTranslations()

  return (
    <>
      <div data-testid="section-heading-row" className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionLabel>{t('profile.sections.aiFeatures')}</SectionLabel>
        </div>
        <div className="flex shrink-0 items-center pt-6 pr-4 pb-3">
          <ProBadge />
        </div>
      </div>
      {hasProAccess ? (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
          divider={false}
        >
          <AstraSettingsSwitch checked={aiSummaryEnabled} pending={summaryPending} label={t('profile.aiSummary.title')} onToggle={onToggleSummary} />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          onClick={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
        </SettingsRow>
      )}
      {hasProAccess ? (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          accessory="none"
          divider={false}
        >
          <AstraSettingsSwitch checked={proactiveAstraEnabled} pending={proactivePending} label={t('profile.proactiveAstra.title')} onToggle={onToggleProactive} />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          onClick={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
        </SettingsRow>
      )}
    </>
  )
}
