import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  AppState,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Lock } from 'lucide-react-native'
import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import {
  buildTimeFormatOptions,
  buildWeekStartOptions,
  getNativePushStatusPresentation,
  LANGUAGE_OPTIONS,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { useTimeFormat } from '@/hooks/use-time-format'
import { TrialBanner } from '@/components/ui/trial-banner'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppColors = ReturnType<typeof createColors>

// ---------------------------------------------------------------------------
// Preferences Screen
// ---------------------------------------------------------------------------

export default function PreferencesScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile, patchProfile } = useProfile()
  const { colors, applyScheme } = useAppTheme()
  const {
    currentFormat: timeFormat,
    setFormat: setTimeFormat,
  } = useTimeFormat()
  const {
    isEnabled: pushEnabled,
    isRegistered: pushRegistered,
    isLoading: pushLoading,
    isSupported: pushSupported,
    permissionStatus,
    registrationStatus,
    requestPermission,
    refreshPermissionStatus,
  } = usePushNotifications()
  const styles = useMemo(() => createStyles(colors), [colors])

  const currentScheme = profile?.colorScheme ?? 'purple'

  // --- Language ---
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>('en')

  useEffect(() => {
    const nextLanguage = profile?.language === 'pt-BR' ? 'pt-BR' : 'en'
    setSelectedLanguage(nextLanguage)
  }, [profile?.language])

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

  // --- Week Start Day ---
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

  // --- Color Scheme ---
  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) =>
      performQueuedApiMutation({
        type: 'setColorScheme',
        scope: 'profile',
        endpoint: API.profile.colorScheme,
        method: 'PUT',
        payload: { colorScheme: scheme },
        dedupeKey: 'profile-color-scheme',
      }),
    onMutate: (scheme) => {
      const previous = profile?.colorScheme
      patchProfile({ colorScheme: scheme })
      return { previous }
    },
    onError: (_err, _scheme, context) => {
      if (context?.previous) {
        patchProfile({ colorScheme: context.previous })
      }
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      router.push('/upgrade')
      return
    }
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  const timeFormatOptions = buildTimeFormatOptions(t)

  // --- Home Screen Toggle ---
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)

  useEffect(() => {
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

    return () => {
      subscription.remove()
    }
  }, [pushSupported, refreshPermissionStatus])

  async function handleShowGeneralToggle(nextValue: boolean) {
    setShowGeneralOnToday(nextValue)
    try {
      await AsyncStorage.setItem('orbit_show_general_on_today', String(nextValue))
    } catch {
      // Best-effort local preference persistence
    }
  }

  async function handlePushToggle(nextValue: boolean) {
    if (nextValue) {
      if (permissionStatus === 'denied') {
        await Linking.openSettings().catch(() => {})
        return
      }
      await requestPermission()
      return
    }

    if (permissionStatus === 'granted') {
      await Linking.openSettings().catch(() => {})
    }
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
      ? colors.red400
      : pushStatusPresentation.tone === 'accent'
        ? colors.primary
        : colors.textMuted
  const pushToggleValue = permissionStatus === 'granted'

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('preferences.title')}</Text>
        </View>

        <TrialBanner />

        {/* Language */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('profile.language.title')}</Text>
          <Text style={styles.cardDescription}>
            {t('profile.language.description')}
          </Text>
          <View style={styles.optionRow}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <TouchableOpacity
                key={lang.value}
                style={[
                  styles.optionButton,
                  selectedLanguage === lang.value && styles.optionButtonActive,
                ]}
                onPress={() => handleLanguageChange(lang.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedLanguage === lang.value && styles.optionTextActive,
                  ]}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color Scheme */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>{t('profile.colorScheme.title')}</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>{t('common.proBadge')}</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            {t('profile.colorScheme.description')}
          </Text>
          <View style={styles.schemeRow}>
            {colorSchemeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.schemeDot,
                  { backgroundColor: option.color },
                  currentScheme === option.value && styles.schemeDotActive,
                  currentScheme === option.value && {
                    borderColor: option.color,
                  },
                ]}
                onPress={() => handleSchemeChange(option.value)}
                activeOpacity={0.7}
              >
                {currentScheme === option.value && (
                  <Check size={16} color="#fff" />
                )}
                {!profile?.hasProAccess &&
                  option.value !== 'purple' &&
                  currentScheme !== option.value && (
                    <Lock size={12} color="rgba(255,255,255,0.7)" />
                  )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Time Format */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.timeFormat.title')}</Text>
          <Text style={styles.cardDescription}>
            {t('settings.timeFormat.description')}
          </Text>
          <View style={styles.optionRow}>
            {timeFormatOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  timeFormat === opt.value && styles.optionButtonActive,
                ]}
                onPress={() => setTimeFormat(opt.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    timeFormat === opt.value && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Week Start Day */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.weekStartDay.title')}</Text>
          <Text style={styles.cardDescription}>
            {t('settings.weekStartDay.description')}
          </Text>
          <View style={styles.optionRow}>
            {weekStartOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  profile?.weekStartDay === opt.value && styles.optionButtonActive,
                ]}
                onPress={() => weekStartMutation.mutate(opt.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    profile?.weekStartDay === opt.value && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Home Screen */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t('settings.homeScreen.title')}</Text>
              <Text style={[styles.cardHint, { marginTop: 4 }]}>
                {t('settings.homeScreen.showGeneralDesc')}
              </Text>
            </View>
            <Switch
              value={showGeneralOnToday}
              onValueChange={handleShowGeneralToggle}
              trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Push Notifications */}
        {pushSupported && (
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{t('settings.notifications.title')}</Text>
                <Text style={[styles.cardDescription, { marginTop: 4 }]}>
                  {t('settings.notifications.description')}
                </Text>
              </View>
              <Switch
                value={pushToggleValue}
                onValueChange={handlePushToggle}
                disabled={pushLoading}
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            <Text
              style={[
                styles.statusText,
                {
                  color: pushStatusColor,
                },
              ]}
            >
              {pushStatusText}
            </Text>
            {permissionStatus === 'denied' && (
              <TouchableOpacity
                style={styles.inlineActionButton}
                onPress={() => {
                  void Linking.openSettings().catch(() => {})
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.inlineActionText}>
                  {t('settings.notifications.openSettings')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!pushSupported && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings.notifications.title')}</Text>
            <Text style={styles.statusText}>
              {t('settings.notifications.unsupportedNative')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 32,
      paddingBottom: 24,
    },
    backButton: { padding: 8, marginLeft: -8 },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      marginBottom: 12,
      gap: 10,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textMuted,
    },
    cardDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    cardHint: {
      fontSize: 12,
      color: colors.textMuted,
    },

    proBadge: {
      backgroundColor: colors.primary_20,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
    },
    proBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    schemeRow: {
      flexDirection: 'row',
      gap: 12,
      paddingTop: 4,
    },
    schemeDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.7,
    },
    schemeDotActive: {
      opacity: 1,
      borderWidth: 3,
      transform: [{ scale: 1.1 }],
    },

    optionRow: {
      flexDirection: 'row',
      gap: 8,
    },
    optionButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    optionTextActive: {
      color: '#fff',
    },

    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    statusText: {
      fontSize: 12,
      fontWeight: '500',
    },
    inlineActionButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
      paddingVertical: 4,
    },
    inlineActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
  })
}
