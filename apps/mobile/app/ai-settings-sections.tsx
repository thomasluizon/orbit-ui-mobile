import { BellRing, Lock, Satellite } from '@/components/ui/icons'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import type { Tokens } from './ai-settings-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

interface AiFeatureTogglesProps {
  tokens: Tokens
  t: TranslationFn
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
  tokens,
  t,
  hasProAccess,
  aiSummaryEnabled,
  proactiveAstraEnabled,
  summaryPending,
  proactivePending,
  onToggleSummary,
  onToggleProactive,
  onUpgrade,
}: Readonly<AiFeatureTogglesProps>) {
  return (
    <>
      <SectionLabel bottom={4} trailing={<ProBadge />}>
        {t('profile.sections.aiFeatures')}
      </SectionLabel>
      {hasProAccess ? (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={aiSummaryEnabled}
            onToggle={onToggleSummary}
            disabled={summaryPending}
            accessibilityLabel={t('profile.aiSummary.title')}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          onPress={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
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
          <Switch
            on={proactiveAstraEnabled}
            onToggle={onToggleProactive}
            disabled={proactivePending}
            accessibilityLabel={t('profile.proactiveAstra.title')}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          onPress={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
        </SettingsRow>
      )}
    </>
  )
}
