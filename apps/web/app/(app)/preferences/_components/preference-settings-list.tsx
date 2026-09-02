'use client'

import { Calendar, Languages, Moon } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import type { PreferencePicker } from './preference-picker-sheet'
import {
  PushNotificationSection,
  type PushSectionState,
} from './push-notification-section'
import { MarketingConsentSection } from './marketing-consent-section'

interface PreferenceSettingsListProps {
  mounted: boolean
  languageLabel?: string
  themeLabel?: string
  weekStartLabel?: string
  showGeneralOnToday: boolean
  onOpenPicker: (picker: PreferencePicker) => void
  onToggleShowGeneral: () => void
  push: PushSectionState
}

export function PreferenceSettingsList({
  mounted,
  languageLabel,
  themeLabel,
  weekStartLabel,
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
            divider={false}
          />
          <SettingsRow
            icon={Moon}
            label={t('preferences.themeMode')}
            value={mounted ? themeLabel : undefined}
            onClick={() => onOpenPicker('theme')}
            divider={false}
          />
          <SettingsRow
            icon={Calendar}
            label={t('settings.weekStartDay.title')}
            value={mounted ? weekStartLabel : undefined}
            onClick={() => onOpenPicker('weekStart')}
            divider={false}
          />

          <SectionLabel bottom={4}>{t('settings.homeScreen.title')}</SectionLabel>
          <SettingsRow
            label={t('settings.homeScreen.showGeneral')}
            desc={t('settings.homeScreen.showGeneralDesc')}
            accessory="none"
            divider={false}
          >
            <Switch
              checked={mounted && showGeneralOnToday}
              onChange={onToggleShowGeneral}
              label={t('settings.homeScreen.showGeneral')}
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
