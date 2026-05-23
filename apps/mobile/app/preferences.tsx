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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react-native'
import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  buildWeekStartOptions,
  getNativePushStatusPresentation,
  LANGUAGE_OPTIONS,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { TrialBanner } from '@/components/ui/trial-banner'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Chip } from '@/components/ui/chip'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

type Tokens = ReturnType<typeof createTokensV2>

interface SchemeSwatchesProps {
  active: ColorScheme
  hasProAccess: boolean
  tokens: Tokens
  onSelect: (scheme: ColorScheme) => void
}

function SchemeSwatches({
  active,
  hasProAccess,
  tokens,
  onSelect,
}: Readonly<SchemeSwatchesProps>) {
  return (
    <View style={styles.swatchRow}>
      {colorSchemeOptions.map((option) => {
        const isActive = option.value === active
        const locked = !hasProAccess && option.value !== 'purple'
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.value}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.swatchPress,
              pressed && !locked && { opacity: 0.7 },
            ]}
          >
            <View
              style={[
                styles.swatchDot,
                {
                  backgroundColor: option.color,
                  borderColor: isActive ? tokens.fg1 : 'transparent',
                  borderWidth: isActive ? 2 : 0,
                },
              ]}
            >
              {locked ? (
                <Lock size={9} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              ) : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
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

  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>('en')
  const [previousProfileLanguage, setPreviousProfileLanguage] = useState(
    profile?.language,
  )
  if (profile?.language !== previousProfileLanguage) {
    setPreviousProfileLanguage(profile?.language)
    setSelectedLanguage(profile?.language === 'pt-BR' ? 'pt-BR' : 'en')
  }

  async function handleLanguageChange(locale: 'en' | 'pt-BR') {
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
      // Silently fail
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
      // Best-effort persistence
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

        <SectionLabel>{t('profile.language.title')}</SectionLabel>
        <View
          style={[styles.chipsRow, { borderBottomColor: tokens.hairline }]}
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <Chip
              key={lang.value}
              active={selectedLanguage === lang.value}
              onPress={() => handleLanguageChange(lang.value)}
            >
              {lang.label}
            </Chip>
          ))}
        </View>

        <SectionLabel>{t('preferences.themeMode')}</SectionLabel>
        <View
          style={[styles.themeRow, { borderBottomColor: tokens.hairline }]}
        >
          <Text style={[styles.themeLabel, { color: tokens.fg1 }]}>
            {t('preferences.themeMode')}
          </Text>
          <MonoToggle
            on={currentTheme === 'dark'}
            onLabel={t('preferences.themeModeDark').toUpperCase()}
            offLabel={t('preferences.themeModeLight').toUpperCase()}
            onPress={() => {
              handleThemeModeChange(currentTheme === 'dark' ? 'light' : 'dark')
            }}
            accessibilityLabel={t('preferences.themeMode')}
          />
        </View>

        <View
          style={[styles.schemeRow, { borderBottomColor: tokens.hairline }]}
        >
          <Text style={[styles.themeLabel, { color: tokens.fg1 }]}>
            {t('profile.colorScheme.title')}
          </Text>
          <SchemeSwatches
            active={currentScheme}
            hasProAccess={profile?.hasProAccess ?? false}
            tokens={tokens}
            onSelect={handleSchemeChange}
          />
        </View>

        <SectionLabel>{t('settings.weekStartDay.title')}</SectionLabel>
        <View
          style={[styles.weekRow, { borderBottomColor: tokens.hairline }]}
        >
          <Text style={[styles.themeLabel, { color: tokens.fg1 }]}>
            {t('settings.weekStartDay.title')}
          </Text>
          <View style={styles.weekChips}>
            {weekStartOptions.map((opt) => (
              <Chip
                key={opt.value}
                active={profile?.weekStartDay === opt.value}
                onPress={() => weekStartMutation.mutate(opt.value)}
              >
                {opt.label}
              </Chip>
            ))}
          </View>
        </View>

        <SectionLabel>{t('settings.notifications.title')}</SectionLabel>
        {pushSupported ? (
          <>
            <SettingsRow
              label={t('settings.notifications.title')}
              accessory="none"
            >
              <MonoToggle
                on={pushEnabled}
                onPress={() => {
                  void handlePushToggle()
                }}
                disabled={pushLoading}
                accessibilityLabel={t('settings.notifications.title')}
              />
            </SettingsRow>
            <View
              style={[styles.statusBlock, { borderBottomColor: tokens.hairline }]}
            >
              <Text
                style={[styles.statusText, { color: pushStatusColor }]}
              >
                {pushStatusText}
              </Text>
            </View>
            {permissionStatus === 'denied' ? (
              <View
                style={[
                  styles.actionBlock,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <Pressable
                  onPress={() => {
                    void Linking.openSettings().catch(() => {})
                  }}
                  accessibilityRole="button"
                  style={styles.linkPress}
                >
                  <Text style={[styles.linkText, { color: tokens.fg1 }]}>
                    {t('settings.notifications.openSettings')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <View
            style={[styles.statusBlock, { borderBottomColor: tokens.hairline }]}
          >
            <Text style={[styles.statusText, { color: tokens.fg3 }]}>
              {t('settings.notifications.unsupportedNative')}
            </Text>
          </View>
        )}

        <SectionLabel>{t('settings.homeScreen.title')}</SectionLabel>
        <SettingsRow
          label={t('settings.homeScreen.showGeneralDesc')}
          accessory="none"
        >
          <MonoToggle
            on={showGeneralOnToday}
            onPress={() => {
              void handleShowGeneralToggle(!showGeneralOnToday)
            }}
            accessibilityLabel={t('settings.homeScreen.showGeneralDesc')}
          />
        </SettingsRow>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  schemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    flexWrap: 'wrap',
  },
  weekChips: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  themeLabel: {
    fontFamily: 'Geist',
    fontSize: 15,
    flexShrink: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatchPress: {
    padding: 2,
  },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBlock: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
  },
  actionBlock: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkPress: { padding: 4, alignSelf: 'flex-start' },
  linkText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})
