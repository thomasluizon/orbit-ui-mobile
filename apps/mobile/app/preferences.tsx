import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  AppState,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Calendar, Check, Languages, Moon, Palette } from 'lucide-react-native'
import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  buildWeekStartOptions,
  getNativePushStatusPresentation,
  LANGUAGE_OPTIONS,
  parseShowGeneralOnTodayPreference,
  resolveSystemLocale,
} from '@orbit/shared/utils'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { TrialBanner } from '@/components/ui/trial-banner'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { RadioRow } from '@/components/ui/select-check'
import { ProBadge } from '@/components/ui/pro-badge'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

type PreferencePicker = 'language' | 'theme' | 'scheme' | 'weekStart'

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

export default function PreferencesScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const {
    applyScheme,
    applyTheme,
    currentTheme,
    currentScheme,
  } = useAppTheme()
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

  const [activePicker, setActivePicker] = useState<PreferencePicker | null>(null)

  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>(() =>
    resolveSystemLocale(i18n.language),
  )
  const [previousProfileLanguage, setPreviousProfileLanguage] = useState(
    profile?.language,
  )
  if (profile?.language !== previousProfileLanguage) {
    setPreviousProfileLanguage(profile?.language)
    if (profile?.language) {
      setSelectedLanguage(profile.language === 'pt-BR' ? 'pt-BR' : 'en')
    }
  }

  async function handleLanguageChange(locale: 'en' | 'pt-BR') {
    const previousLanguage = selectedLanguage
    setSelectedLanguage(locale)
    i18n.changeLanguage(locale)
    try {
      await performQueuedApiMutation({
        type: 'setLanguage',
        scope: 'profile',
        endpoint: API.profile.language,
        method: 'PUT',
        payload: { language: locale },
        dedupeKey: 'profile-language',
      })
      patchProfile({ language: locale })
    } catch {
      setSelectedLanguage(previousLanguage)
      i18n.changeLanguage(previousLanguage)
    }
  }

  const weekStartOptions = buildWeekStartOptions(t)
  const weekStartMutation = useMutation({
    mutationFn: (day: number) =>
      performQueuedApiMutation({
        type: 'setWeekStartDay',
        scope: 'profile',
        endpoint: API.profile.weekStartDay,
        method: 'PUT',
        payload: { weekStartDay: day },
        dedupeKey: 'profile-week-start-day',
      }),
    onMutate: (day) => {
      const previous = profile?.weekStartDay
      patchProfile({ weekStartDay: day })
      return { previous }
    },
    onError: (_err, _day, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ weekStartDay: context.previous })
      }
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      setActivePicker(null)
      router.push(buildUpgradeHref('/preferences'))
      return
    }
    applyScheme(scheme)
  }

  function handleThemeModeChange(mode: ThemeMode) {
    if (mode === currentTheme) return
    applyTheme(mode)
  }

  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)

  useEffect(() => {
    void AsyncStorage.removeItem('orbit_time_format')
    AsyncStorage.getItem('orbit_show_general_on_today')
      .then((saved) => {
        setShowGeneralOnToday(parseShowGeneralOnTodayPreference(saved))
      })
      .catch(() => {
        setShowGeneralOnToday(false)
      })
  }, [])

  useEffect(() => {
    if (!pushSupported) return
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPermissionStatus()
      }
    })
    return () => subscription.remove()
  }, [pushSupported, refreshPermissionStatus])

  async function handleShowGeneralToggle(nextValue: boolean) {
    setShowGeneralOnToday(nextValue)
    try {
      await AsyncStorage.setItem(
        'orbit_show_general_on_today',
        String(nextValue),
      )
    } catch {
      setShowGeneralOnToday(!nextValue)
    }
  }

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

  const pushStatusPresentation = getNativePushStatusPresentation({
    permissionStatus,
    registrationStatus,
    isEnabled: pushEnabled,
    isRegistered: pushRegistered,
  })
  const pushStatusText = t(pushStatusPresentation.messageKey)
  const pushStatusColor =
    pushStatusPresentation.tone === 'critical'
      ? tokens.statusBad
      : pushStatusPresentation.tone === 'accent'
        ? tokens.primary
        : tokens.fg3

  const themeModeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('preferences.themeModeDark') },
    { value: 'light', label: t('preferences.themeModeLight') },
  ]

  const languageLabel = LANGUAGE_OPTIONS.find(
    (lang) => lang.value === selectedLanguage,
  )?.label
  const themeLabel = themeModeOptions.find(
    (mode) => mode.value === currentTheme,
  )?.label
  const schemeOption = colorSchemeOptions.find(
    (option) => option.value === currentScheme,
  )
  const schemeLabel = schemeOption
    ? t(`preferences.color${capitalize(schemeOption.value)}`)
    : undefined
  const weekStartLabel = weekStartOptions.find(
    (option) => option.value === profile?.weekStartDay,
  )?.label

  const pickerTitles: Record<PreferencePicker, string> = {
    language: t('profile.language.title'),
    theme: t('preferences.themeMode'),
    scheme: t('profile.colorScheme.title'),
    weekStart: t('settings.weekStartDay.title'),
  }

  function closePicker() {
    setActivePicker(null)
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('preferences.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TrialBanner />

        <Animated.View entering={sectionEntrance(0)}>
          <SectionLabel bottom={4}>{t('preferences.general')}</SectionLabel>
          <SettingsRow
            icon={Languages}
            label={t('profile.language.title')}
            desc={t('profile.language.description')}
            value={languageLabel}
            onPress={() => setActivePicker('language')}
            divider={false}
          />
          <SettingsRow
            icon={Moon}
            label={t('preferences.themeMode')}
            value={themeLabel}
            onPress={() => setActivePicker('theme')}
            divider={false}
          />
          <SettingsRow
            icon={Palette}
            label={t('profile.colorScheme.title')}
            desc={t('profile.colorScheme.description')}
            value={schemeLabel}
            onPress={() => setActivePicker('scheme')}
            divider={false}
          >
            {schemeOption ? (
              <View style={[styles.schemeDot, { backgroundColor: schemeOption.color }]} />
            ) : null}
            <ProBadge />
          </SettingsRow>
          <SettingsRow
            icon={Calendar}
            label={t('settings.weekStartDay.title')}
            desc={t('settings.weekStartDay.description')}
            value={weekStartLabel}
            onPress={() => setActivePicker('weekStart')}
            divider={false}
          />
        </Animated.View>

        <Animated.View entering={sectionEntrance(1)}>
          <SectionLabel bottom={4}>{t('settings.homeScreen.title')}</SectionLabel>
          <SettingsRow
            label={t('settings.homeScreen.showGeneral')}
            desc={t('settings.homeScreen.showGeneralDesc')}
            accessory="none"
            divider={false}
          >
            <Switch
              on={showGeneralOnToday}
              onToggle={() => {
                void handleShowGeneralToggle(!showGeneralOnToday)
              }}
              accessibilityLabel={t('settings.homeScreen.showGeneral')}
            />
          </SettingsRow>
        </Animated.View>

        <Animated.View entering={sectionEntrance(2)}>
          <SectionLabel bottom={4}>{t('settings.notifications.title')}</SectionLabel>
          {pushSupported ? (
            <>
              <SettingsRow
                label={t('settings.notifications.allowed')}
                accessory="none"
                divider={false}
              >
                <Switch
                  on={pushEnabled}
                  onToggle={() => {
                    void handlePushToggle()
                  }}
                  disabled={pushLoading}
                  accessibilityLabel={t('settings.notifications.title')}
                />
              </SettingsRow>
              <View style={styles.statusBlock}>
                <Text style={[styles.statusText, { color: pushStatusColor }]}>
                  {pushStatusText}
                </Text>
              </View>
              {permissionStatus === 'denied' ? (
                <Pressable
                  onPress={() => {
                    void Linking.openSettings().catch(() => {})
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.linkChip,
                    {
                      backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                      borderColor: tokens.hairline,
                    },
                    pressed ? styles.linkChipPressed : null,
                  ]}
                >
                  <Text style={[styles.linkText, { color: tokens.fg2 }]}>
                    {t('settings.notifications.openSettings')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.statusBlock}>
              <Text style={[styles.statusText, { color: tokens.fg3 }]}>
                {t('settings.notifications.unsupportedNative')}
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <BottomSheetModal
        open={activePicker !== null}
        onClose={closePicker}
        title={activePicker ? pickerTitles[activePicker] : undefined}
        contentKey={activePicker ?? 'none'}
        snapPoints={['55%']}
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {activePicker === 'language' &&
            LANGUAGE_OPTIONS.map((lang, index) => (
              <RadioRow
                key={lang.value}
                label={lang.label}
                selected={selectedLanguage === lang.value}
                divider={index < LANGUAGE_OPTIONS.length - 1}
                onPress={() => {
                  closePicker()
                  void handleLanguageChange(lang.value)
                }}
              />
            ))}
          {activePicker === 'theme' &&
            themeModeOptions.map((mode, index) => (
              <RadioRow
                key={mode.value}
                label={mode.label}
                selected={currentTheme === mode.value}
                divider={index < themeModeOptions.length - 1}
                onPress={() => {
                  closePicker()
                  handleThemeModeChange(mode.value)
                }}
              />
            ))}
          {activePicker === 'scheme' && (
            <>
              {colorSchemeOptions.map((option, index) => (
                <RadioRow
                  key={option.value}
                  label={t(`preferences.color${capitalize(option.value)}`)}
                  selected={currentScheme === option.value}
                  dot={option.color}
                  divider={index < colorSchemeOptions.length - 1}
                  onPress={() => {
                    handleSchemeChange(option.value)
                  }}
                />
              ))}
              <View style={styles.sheetFooter}>
                <PillButton
                  variant="white"
                  fullWidth
                  onPress={closePicker}
                  leading={<Check size={18} color={tokens.bg} strokeWidth={2} />}
                >
                  {t('common.save')}
                </PillButton>
              </View>
            </>
          )}
          {activePicker === 'weekStart' &&
            weekStartOptions.map((option, index) => (
              <RadioRow
                key={option.value}
                label={option.label}
                selected={profile?.weekStartDay === option.value}
                divider={index < weekStartOptions.length - 1}
                onPress={() => {
                  closePicker()
                  weekStartMutation.mutate(option.value)
                }}
              />
            ))}
        </ScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  schemeDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statusText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
  linkChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  linkText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  sheetFooter: {
    paddingTop: 16,
    paddingBottom: 4,
  },
})
