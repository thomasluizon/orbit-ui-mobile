import { View } from 'react-native'
import { BellRing, Lock, Satellite } from '@/components/ui/icons'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { AstraSettingsSwitch } from '@/components/profile/astra-settings-controller'
import type { Tokens } from '@/app/ai-settings-styles'

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
      <View testID="section-heading-row" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>{t('profile.sections.aiFeatures')}</SectionLabel>
        </View>
        <View style={{ flexShrink: 0, alignItems: 'center', paddingTop: 24, paddingRight: 16, paddingBottom: 12 }}>
          <ProBadge />
        </View>
      </View>
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
          <AstraSettingsSwitch checked={proactiveAstraEnabled} pending={proactivePending} label={t('profile.proactiveAstra.title')} onToggle={onToggleProactive} />
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
