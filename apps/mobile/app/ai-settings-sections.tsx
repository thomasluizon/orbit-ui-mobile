import type { ReactNode } from 'react'
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

interface PendingSwitchBoundaryProps {
  pending: boolean
  checked: boolean
  label: string
  children: ReactNode
}

function PendingSwitchBoundary({
  pending,
  checked,
  label,
  children,
}: Readonly<PendingSwitchBoundaryProps>) {
  return (
    <View
      pointerEvents={pending ? 'none' : 'auto'}
      accessible={pending}
      accessibilityRole={pending ? 'switch' : undefined}
      accessibilityLabel={pending ? label : undefined}
      accessibilityState={pending ? { checked, disabled: true } : undefined}
    >
      <View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
    </View>
  )
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
          <PendingSwitchBoundary
            pending={summaryPending}
            checked={aiSummaryEnabled}
            label={t('profile.aiSummary.title')}
          >
            <Switch
              checked={aiSummaryEnabled}
              onChange={onToggleSummary}
              label={t('profile.aiSummary.title')}
            />
          </PendingSwitchBoundary>
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
          <PendingSwitchBoundary
            pending={proactivePending}
            checked={proactiveAstraEnabled}
            label={t('profile.proactiveAstra.title')}
          >
            <Switch
              checked={proactiveAstraEnabled}
              onChange={onToggleProactive}
              label={t('profile.proactiveAstra.title')}
            />
          </PendingSwitchBoundary>
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
