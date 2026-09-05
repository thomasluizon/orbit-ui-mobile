'use client'

import { BellRing, Lock, Satellite } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { ProBadge } from '@/components/ui/pro-badge'

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
      <><SectionLabel>
        {t('profile.sections.aiFeatures')}
      </SectionLabel>
{<ProBadge />}</>
      {hasProAccess ? (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
          divider={false}
        >
          <fieldset disabled={summaryPending} className="m-0 border-0 p-0">
            <Switch
              checked={aiSummaryEnabled}
              onChange={onToggleSummary}
              label={t('profile.aiSummary.title')}
            />
          </fieldset>
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
          <fieldset disabled={proactivePending} className="m-0 border-0 p-0">
            <Switch
              checked={proactiveAstraEnabled}
              onChange={onToggleProactive}
              label={t('profile.proactiveAstra.title')}
            />
          </fieldset>
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
