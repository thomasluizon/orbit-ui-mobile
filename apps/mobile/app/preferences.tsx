import { useEffect, useMemo } from 'react'
import { ScrollView, View, Linking, AppState } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { buildWeekStartOptions } from '@orbit/shared/utils'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { usePersistentReminder } from '@/hooks/use-persistent-reminder'
import { useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { styles } from './preferences-styles'
import { usePreferenceControls } from './use-preference-controls'
import { derivePreferenceLabels } from './preferences-labels'
import {
  PreferenceSettingsList,
  PreferencePickerSheet,
  type PreferencePicker,
} from '@/components/profile/preferences-sections'

export default function PreferencesScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const { sheetRef, closeSheet } = useSheetHost()
  const {
    profile,
    currentScheme,
    currentTheme,
    activePicker,
    setActivePicker,
    selectedLanguage,
    showGeneralOnToday,
    handleLanguageChange,
    handleThemeModeChange,
    handleShowGeneralToggle,
    weekStartMutation,
  } = usePreferenceControls()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const {
    isEnabled: pushEnabled,
    isRegistered: pushRegistered,
    isLoading: pushLoading,
    isSupported: pushSupported,
    permissionStatus,
    registrationStatus,
    disablePushNotifications,
    requestPermission,
    refreshPermissionStatus,
  } = usePushNotifications()
  const persistentReminder = usePersistentReminder()

  useEffect(() => {
    if (!pushSupported) return
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPermissionStatus()
      }
    })
    return () => subscription.remove()
  }, [pushSupported, refreshPermissionStatus])

  async function handlePushToggle() {
    const nextValue = !pushEnabled
    if (nextValue) {
      if (permissionStatus === 'denied') {
        await Linking.openSettings().catch(() => {})
        return
      }
      await requestPermission()
      return
    }
    await disablePushNotifications()
  }

  const weekStartOptions = buildWeekStartOptions(t)

  const themeModeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('preferences.themeModeDark') },
    { value: 'light', label: t('preferences.themeModeLight') },
  ]

  const { languageLabel, themeLabel, weekStartLabel } =
    derivePreferenceLabels(t, {
      selectedLanguage,
      currentTheme,
      weekStartDay: profile?.weekStartDay,
      themeModeOptions,
      weekStartOptions,
    })

  const pickerTitles: Record<PreferencePicker, string> = {
    language: t('profile.language.title'),
    theme: t('preferences.themeMode'),
    weekStart: t('settings.weekStartDay.title'),
  }

  const pickerDescriptions: Partial<Record<PreferencePicker, string>> = {
    language: t('profile.language.description'),
    weekStart: t('settings.weekStartDay.description'),
  }

  function hidePicker() {
    setActivePicker(null)
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar onBack={() => goBackOrFallback('/profile')}
title={t('preferences.title')}
backLabel={t('common.backToProfile')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PreferenceSettingsList
          tokens={tokens}
          t={t}
          languageLabel={languageLabel}
          themeLabel={themeLabel}
          weekStartLabel={weekStartLabel}
          showGeneralOnToday={showGeneralOnToday}
          onOpenPicker={setActivePicker}
          onToggleShowGeneral={() => {
            void handleShowGeneralToggle(!showGeneralOnToday)
          }}
          push={{
            pushSupported,
            pushEnabled,
            pushRegistered,
            pushLoading,
            permissionStatus,
            registrationStatus,
            onToggle: () => {
              void handlePushToggle()
            },
            onOpenSettings: () => {
              void Linking.openSettings().catch(() => {})
            },
          }}
          persistentReminder={{
            isSupported: persistentReminder.isSupported,
            enabled: persistentReminder.enabled,
            isLoading: persistentReminder.isLoading,
            onToggle: () => {
              void persistentReminder.toggle()
            },
          }}
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      <PreferencePickerSheet
        tokens={tokens}
        activePicker={activePicker}
        pickerTitles={pickerTitles}
        pickerDescriptions={pickerDescriptions}
        selectedLanguage={selectedLanguage}
        currentTheme={currentTheme}
        weekStartDay={profile?.weekStartDay}
        themeModeOptions={themeModeOptions}
        weekStartOptions={weekStartOptions}
        sheetRef={sheetRef}
        closePicker={closeSheet}
        onHidden={hidePicker}
        onLanguageChange={(locale) => {
          void handleLanguageChange(locale)
        }}
        onThemeModeChange={handleThemeModeChange}
        onWeekStartChange={(day) => weekStartMutation.mutate(day)}
      />
    </SafeAreaView>
  )
}
