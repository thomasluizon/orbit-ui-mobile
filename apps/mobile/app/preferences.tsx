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
import { ArrowLeft, Check, Lock } from 'lucide-react-native'
import { useMutation } from '@tanstack/react-query'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Colors (from globals.css design system)
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  red: '#ef4444',
}

// Language options
const LANGUAGE_OPTIONS: { value: 'en' | 'pt-BR'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português' },
]

// ---------------------------------------------------------------------------
// Preferences Screen
// ---------------------------------------------------------------------------

export default function PreferencesScreen() {
  const router = useRouter()
  const { profile, patchProfile } = useProfile()

  const currentScheme = profile?.colorScheme ?? 'purple'

  // --- Language ---
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>(
    (profile?.language as 'en' | 'pt-BR') ?? 'en'
  )

  async function handleLanguageChange(locale: 'en' | 'pt-BR') {
    setSelectedLanguage(locale)
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
    { value: 1, label: 'Monday' },
    { value: 0, label: 'Sunday' },
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
    { value: '12h' as const, label: '12-hour' },
    { value: '24h' as const, label: '24-hour' },
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
          <Text style={styles.headerTitle}>Preferences</Text>
        </View>

        {/* Language */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Language</Text>
          <Text style={styles.cardDescription}>
            Choose the display language for the app.
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
            <Text style={styles.cardLabel}>Color Scheme</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Choose your accent color. Pro users can pick any scheme.
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
          <Text style={styles.cardLabel}>Time Format</Text>
          <Text style={styles.cardDescription}>
            Choose how times are displayed throughout the app.
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
          <Text style={styles.cardLabel}>Week Start Day</Text>
          <Text style={styles.cardDescription}>
            Choose which day your week starts on for calendar views.
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
              <Text style={styles.cardLabel}>Home Screen</Text>
              <Text style={[styles.cardHint, { marginTop: 4 }]}>
                Show "General" habits on today view
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
              <Text style={styles.cardLabel}>Notifications</Text>
              <Text style={[styles.cardDescription, { marginTop: 4 }]}>
                Receive reminders and updates about your habits.
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
            {pushEnabled ? 'Enabled' : 'Disabled'}
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
