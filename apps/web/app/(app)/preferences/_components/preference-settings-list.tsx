'use client'

import { Calendar, Languages, Moon, Palette } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'
import type { PreferencePicker } from './preference-picker-sheet'
import {
  PushNotificationSection,
  type PushSectionState,
} from './push-notification-section'
import { MarketingConsentSection } from './marketing-consent-section'

function SchemeDot({ color }: Readonly<{ color: string }>) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full shrink-0"
      style={{ width: 12, height: 12, background: color }}
    />
  )
}

interface PreferenceSettingsListProps {
  mounted: boolean
  languageLabel?: string
  themeLabel?: string
  schemeLabel?: string
  weekStartLabel?: string
  schemeColor?: string
  showGeneralOnToday: boolean
  onOpenPicker: (picker: PreferencePicker) => void
  onToggleShowGeneral: () => void
  push: PushSectionState
}

export function PreferenceSettingsList({
  mounted,
  languageLabel,
  themeLabel,
  schemeLabel,
  weekStartLabel,
  schemeColor,
  showGeneralOnToday,
  onOpenPicker,
  onToggleShowGeneral,
  push,
}: Readonly<PreferenceSettingsListProps>) {
  const t = useTranslations()

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div>
        <div className="stagger-enter">
          <SectionLabel bottom={4}>{t('preferences.general')}</SectionLabel>
          <SettingsRow
            icon={Languages}
            label={t('profile.language.title')}
            value={mounted ? languageLabel : undefined}
            onClick={() => onOpenPicker('language')}
            dataTestId="pref-open-language"
          />
          <SettingsRow
            icon={Moon}
            label={t('preferences.themeMode')}
            value={mounted ? themeLabel : undefined}
            onClick={() => onOpenPicker('theme')}
            dataTestId="pref-open-theme"
          />
          <SettingsRow
            icon={Palette}
            label={t('profile.colorScheme.title')}
            value={mounted ? schemeLabel : undefined}
            onClick={() => onOpenPicker('scheme')}
            dataTestId="pref-open-scheme"
          >
            {mounted && schemeColor ? <SchemeDot color={schemeColor} /> : null}
            <ProBadge />
          </SettingsRow>
          <SettingsRow
            icon={Calendar}
            label={t('settings.weekStartDay.title')}
            value={mounted ? weekStartLabel : undefined}
            onClick={() => onOpenPicker('weekStart')}
            dataTestId="pref-open-weekStart"
          />

          <SectionLabel bottom={4}>{t('settings.homeScreen.title')}</SectionLabel>
          <SettingsRow
            label={t('settings.homeScreen.showGeneral')}
            desc={t('settings.homeScreen.showGeneralDesc')}
            accessory="none"
          >
            <Switch
              on={mounted && showGeneralOnToday}
              onToggle={onToggleShowGeneral}
              ariaLabel={t('settings.homeScreen.showGeneral')}
            />
          </SettingsRow>
        </div>

        <div className="stagger-enter">
          <PushNotificationSection push={push} />
        </div>

        <div className="stagger-enter">
          <MarketingConsentSection />
        </div>
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
