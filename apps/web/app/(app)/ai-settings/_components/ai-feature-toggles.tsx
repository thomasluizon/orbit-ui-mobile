'use client'

import { BellRing, Brain, Lock, Satellite } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'

interface AiFeatureTogglesProps {
  hasProAccess: boolean
  aiMemoryEnabled: boolean
  aiSummaryEnabled: boolean
  proactiveAstraEnabled: boolean
  memoryPending: boolean
  summaryPending: boolean
  proactivePending: boolean
  onToggleMemory: () => void
  onToggleSummary: () => void
  onToggleProactive: () => void
  onUpgrade: () => void
}

export function AiFeatureToggles({
  hasProAccess,
  aiMemoryEnabled,
  aiSummaryEnabled,
  proactiveAstraEnabled,
  memoryPending,
  summaryPending,
  proactivePending,
  onToggleMemory,
  onToggleSummary,
  onToggleProactive,
  onUpgrade,
}: Readonly<AiFeatureTogglesProps>) {
  const t = useTranslations()

  return (
    <>
      <SectionLabel bottom={4} trailing={<ProBadge />}>
        {t('profile.sections.aiFeatures')}
      </SectionLabel>
      {hasProAccess ? (
        <SettingsRow
          icon={Brain}
          label={t('profile.aiMemory.title')}
          desc={t('profile.aiMemory.description')}
          accessory="none"
        >
          <Switch
            on={aiMemoryEnabled}
            onToggle={onToggleMemory}
            ariaLabel={t('profile.aiMemory.title')}
            disabled={memoryPending}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Brain}
          label={t('profile.aiMemory.title')}
          desc={t('profile.aiMemory.description')}
          onClick={onUpgrade}
          accessory="chevron"
        >
          <Lock size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
        </SettingsRow>
      )}
      {hasProAccess ? (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
        >
          <Switch
            on={aiSummaryEnabled}
            onToggle={onToggleSummary}
            ariaLabel={t('profile.aiSummary.title')}
            disabled={summaryPending}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          onClick={onUpgrade}
          accessory="chevron"
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
        >
          <Switch
            on={proactiveAstraEnabled}
            onToggle={onToggleProactive}
            ariaLabel={t('profile.proactiveAstra.title')}
            disabled={proactivePending}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          onClick={onUpgrade}
          accessory="chevron"
        >
          <Lock size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
        </SettingsRow>
      )}
    </>
  )
}
