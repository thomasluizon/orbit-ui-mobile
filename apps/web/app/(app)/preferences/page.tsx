'use client'

import { useTranslations } from 'next-intl'
import { buildWeekStartOptions } from '@orbit/shared/utils'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { useIsClient } from '@/hooks/use-is-client'
import { usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import {
  PreferencePickerSheet,
  type PreferencePicker,
} from './_components/preference-picker-sheet'
import { PreferenceSettingsList } from './_components/preference-settings-list'
import { usePreferenceControls } from './_components/use-preference-controls'
import { derivePreferenceLabels } from './_components/preference-labels'

export default function PreferencesPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const mounted = useIsClient()
  const {
    profile,
    currentScheme,
    currentTheme,
    activePicker,
    setActivePicker,
    selectedLanguage,
    showGeneralOnToday,
    handleLanguageChange,
    handleSchemeChange,
    handleThemeModeChange,
    toggleShowGeneral,
    weekStartMutation,
  } = usePreferenceControls()

  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    permission: pushPermission,
    loading: pushLoading,
    status: pushStatus,
    togglePush: handleTogglePush,
  } = usePushNotificationPreferences()

  const weekStartOptions = buildWeekStartOptions(t)

  const themeModeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('preferences.themeModeDark') },
    { value: 'light', label: t('preferences.themeModeLight') },
  ]

  const { languageLabel, themeLabel, schemeLabel, schemeColor, weekStartLabel } =
    derivePreferenceLabels(t, {
      selectedLanguage,
      currentTheme,
      currentScheme,
      weekStartDay: profile?.weekStartDay,
      themeModeOptions,
      weekStartOptions,
    })

  const pickerTitles: Record<PreferencePicker, string> = {
    language: t('profile.language.title'),
    theme: t('preferences.themeMode'),
    scheme: t('profile.colorScheme.title'),
    weekStart: t('settings.weekStartDay.title'),
  }

  const pickerDescriptions: Partial<Record<PreferencePicker, string>> = {
    language: t('profile.language.description'),
    scheme: t('profile.colorScheme.description'),
    weekStart: t('settings.weekStartDay.description'),
  }

  function closePicker() {
    setActivePicker(null)
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('preferences.title')}
      />
      <PreferenceSettingsList
        mounted={mounted}
        languageLabel={languageLabel}
        themeLabel={themeLabel}
        schemeLabel={schemeLabel}
        weekStartLabel={weekStartLabel}
        schemeColor={schemeColor}
        showGeneralOnToday={showGeneralOnToday}
        onOpenPicker={setActivePicker}
        onToggleShowGeneral={toggleShowGeneral}
        push={{
          supported: pushSupported,
          subscribed: pushSubscribed,
          permission: pushPermission,
          loading: pushLoading,
          status: pushStatus,
          onToggle: handleTogglePush,
        }}
      />

      <PreferencePickerSheet
        activePicker={activePicker}
        mounted={mounted}
        selectedLanguage={selectedLanguage}
        currentTheme={currentTheme}
        currentScheme={currentScheme}
        weekStartDay={profile?.weekStartDay}
        themeModeOptions={themeModeOptions}
        weekStartOptions={weekStartOptions}
        pickerTitles={pickerTitles}
        pickerDescriptions={pickerDescriptions}
        onClose={closePicker}
        onLanguageChange={(locale) => void handleLanguageChange(locale)}
        onThemeModeChange={handleThemeModeChange}
        onSchemeChange={handleSchemeChange}
        onWeekStartChange={(day) => weekStartMutation.mutate(day)}
      />
    </div>
  )
}
