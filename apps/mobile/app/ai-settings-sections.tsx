import { View } from 'react-native'
import { BellRing, Lock, Satellite } from '@/components/ui/icons'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
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
          <View
            pointerEvents={summaryPending ? 'none' : 'auto'}
            accessibilityState={{ disabled: summaryPending }}
          >
            <Switch
              checked={aiSummaryEnabled}
              onChange={onToggleSummary}
              label={t('profile.aiSummary.title')}
            />
          </View>
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
          <View
            pointerEvents={proactivePending ? 'none' : 'auto'}
            accessibilityState={{ disabled: proactivePending }}
          >
            <Switch
              checked={proactiveAstraEnabled}
              onChange={onToggleProactive}
              label={t('profile.proactiveAstra.title')}
            />
          </View>
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
