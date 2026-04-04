import { useState, useCallback } from 'react'
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
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Colors / constants
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
}

const COLOR_SCHEMES = [
  { value: 'purple', color: '#8b5cf6' },
  { value: 'blue', color: '#3b82f6' },
  { value: 'green', color: '#22c55e' },
  { value: 'orange', color: '#f97316' },
  { value: 'red', color: '#ef4444' },
  { value: 'pink', color: '#ec4899' },
]

// ---------------------------------------------------------------------------
// Preferences Screen
// ---------------------------------------------------------------------------

export default function PreferencesScreen() {
  const router = useRouter()
  const { profile, patchProfile } = useProfile()

  const currentScheme = profile?.colorScheme ?? 'purple'

  // Week start day
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

  // Color scheme
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

  function handleSchemeChange(scheme: string) {
    if (!profile?.hasProAccess && scheme !== 'purple') return
    colorSchemeMutation.mutate(scheme)
  }

  // Time format (local only)
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h')

  // Show general on today (local only)
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(true)

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
            {COLOR_SCHEMES.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[
                  styles.schemeDot,
                  { backgroundColor: s.color },
                  currentScheme === s.value && styles.schemeDotActive,
                  currentScheme === s.value && {
                    borderColor: s.color,
                  },
                ]}
                onPress={() => handleSchemeChange(s.value)}
                activeOpacity={0.7}
              >
                {currentScheme === s.value && (
                  <Check size={16} color="#fff" />
                )}
                {!profile?.hasProAccess &&
                  s.value !== 'purple' &&
                  currentScheme !== s.value && (
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
            {(['12h', '24h'] as const).map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[
                  styles.optionButton,
                  timeFormat === fmt && styles.optionButtonActive,
                ]}
                onPress={() => setTimeFormat(fmt)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    timeFormat === fmt && styles.optionTextActive,
                  ]}
                >
                  {fmt === '12h' ? '12-hour' : '24-hour'}
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
            {[
              { value: 1, label: 'Monday' },
              { value: 0, label: 'Sunday' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  profile?.weekStartDay === opt.value &&
                    styles.optionButtonActive,
                ]}
                onPress={() => weekStartMutation.mutate(opt.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    profile?.weekStartDay === opt.value &&
                      styles.optionTextActive,
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
              <Text style={styles.cardDescription}>
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
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
  proBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
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
    borderRadius: 12,
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
})
