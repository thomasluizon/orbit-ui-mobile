'use client'

import { BellRing, Brain, Satellite } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { ProUpgradeLink } from './pro-upgrade-link'

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
}: Readonly<AiFeatureTogglesProps>) {
  const t = useTranslations()

  return (
    <>
      <SectionLabel bottom={4} trailing={<ProBadge />}>
        {t('profile.sections.aiFeatures')}
      </SectionLabel>
      <SettingsRow
        icon={Brain}
        label={t('profile.aiMemory.title')}
        desc={t('profile.aiMemory.description')}
        accessory="none"
        divider={false}
      >
        {hasProAccess ? (
          <Switch
            on={aiMemoryEnabled}
            onToggle={onToggleMemory}
            ariaLabel={t('profile.aiMemory.title')}
            disabled={memoryPending}
          />
        ) : (
          <ProUpgradeLink label={t('common.proBadge')} />
        )}
      </SettingsRow>
      <SettingsRow
        icon={Satellite}
        label={t('profile.aiSummary.title')}
        desc={t('profile.aiSummary.description')}
        accessory="none"
        divider={false}
      >
        {hasProAccess ? (
          <Switch
            on={aiSummaryEnabled}
            onToggle={onToggleSummary}
            ariaLabel={t('profile.aiSummary.title')}
            disabled={summaryPending}
          />
        ) : (
          <ProUpgradeLink label={t('common.proBadge')} />
        )}
      </SettingsRow>
      <SettingsRow
        icon={BellRing}
        label={t('profile.proactiveAstra.title')}
        desc={t('profile.proactiveAstra.description')}
        accessory="none"
        divider={false}
      >
        {hasProAccess ? (
          <Switch
            on={proactiveAstraEnabled}
            onToggle={onToggleProactive}
            ariaLabel={t('profile.proactiveAstra.title')}
            disabled={proactivePending}
          />
        ) : (
          <ProUpgradeLink label={t('common.proBadge')} />
        )}
      </SettingsRow>
    </>
  )
}
