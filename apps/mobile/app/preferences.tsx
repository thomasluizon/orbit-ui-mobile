import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Lock } from 'lucide-react-native'
import { useMutation } from '@tanstack/react-query'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { colors } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// Language options (labels are proper nouns, not translated)
const LANGUAGE_OPTIONS: { value: 'en' | 'pt-BR'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português' },
]

// ---------------------------------------------------------------------------
// Preferences Screen
// ---------------------------------------------------------------------------

export default function PreferencesScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile, patchProfile } = useProfile()

  const currentScheme = profile?.colorScheme ?? 'purple'

  // --- Language ---
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>(
    (profile?.language as 'en' | 'pt-BR') ?? 'en'
  )

  async function handleLanguageChange(locale: 'en' | 'pt-BR') {
    setSelectedLanguage(locale)
    i18n.changeLanguage(locale)
    try {
      await apiClient('/api/profile/language', {
        method: 'PUT',
        body: JSON.stringify({ language: locale }),
      })
      patchProfile({ language: locale })
    } catch {
      // Silently fail
    }
  }

  // --- Week Start Day ---
  const weekStartOptions = [
    { value: 1, label: t('settings.weekStartDay.monday') },
    { value: 0, label: t('settings.weekStartDay.sunday') },
  ]

  const weekStartMutation = useMutation({
    mutationFn: (day: number) =>
      apiClient('/api/profile/week-start-day', {
        method: 'PUT',
        body: JSON.stringify({ weekStartDay: day }),
      }),
    onMutate: (day) => {
      patchProfile({ weekStartDay: day })
    },
  })

  // --- Color Scheme ---
  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) =>
      apiClient('/api/profile/color-scheme', {
        method: 'PUT',
        body: JSON.stringify({ colorScheme: scheme }),
      }),
    onMutate: (scheme) => {
      patchProfile({ colorScheme: scheme })
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      router.push('/upgrade')
      return
    }
    colorSchemeMutation.mutate(scheme)
  }

  // --- Time Format (local only) ---
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h')

  const timeFormatOptions = [
    { value: '12h' as const, label: t('settings.timeFormat.12h') },
    { value: '24h' as const, label: t('settings.timeFormat.24h') },
  ]

  // --- Home Screen Toggle ---
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(true)

  // --- Push Notifications (mobile uses expo-notifications) ---
  const [pushEnabled, setPushEnabled] = useState(false)

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
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('preferences.title')}</Text>
        </View>

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
              <Text style={styles.proBadgeText}>PRO</Text>
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
              onValueChange={setShowGeneralOnToday}
              trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Push Notifications */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t('settings.notifications.title')}</Text>
              <Text style={[styles.cardDescription, { marginTop: 4 }]}>
                {t('settings.notifications.description')}
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text
            style={[
              styles.statusText,
              { color: pushEnabled ? colors.primary : colors.textMuted },
            ]}
          >
            {pushEnabled ? t('settings.notifications.enabled') : t('settings.notifications.disabled')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(139,92,246,0.20)',
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
})
