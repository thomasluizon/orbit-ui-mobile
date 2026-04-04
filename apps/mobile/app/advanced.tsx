import { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  CheckCircle,
} from 'lucide-react-native'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Colors
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
  green: '#22c55e',
}

// ---------------------------------------------------------------------------
// Common timezone list (subset for mobile)
// ---------------------------------------------------------------------------

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

// ---------------------------------------------------------------------------
// Advanced Screen
// ---------------------------------------------------------------------------

export default function AdvancedScreen() {
  const router = useRouter()
  const { profile, patchProfile } = useProfile()

  // Timezone
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneSaved, setTimezoneSaved] = useState(false)

  const filteredTimezones = useMemo(() => {
    const search = timezoneSearch.toLowerCase()
    if (!search) return COMMON_TIMEZONES
    return COMMON_TIMEZONES.filter((tz) =>
      tz.toLowerCase().includes(search),
    )
  }, [timezoneSearch])

  async function handleTimezoneChange(newTimezone: string) {
    setTimezoneSaving(true)
    setTimezoneSaved(false)
    try {
      await apiClient('/api/profile/timezone', {
        method: 'PATCH',
        body: JSON.stringify({ timeZone: newTimezone }),
      })
      patchProfile({ timeZone: newTimezone })
    } catch {
      // Silently fail
    }
    setTimeout(() => {
      setTimezoneSaving(false)
      setTimezoneSaved(true)
      setTimezoneOpen(false)
      setTimezoneSearch('')
    }, 400)
  }

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
          <Text style={styles.headerTitle}>Advanced</Text>
        </View>

        {/* Timezone */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Timezone</Text>
          <View style={styles.timezoneRow}>
            <Text style={styles.timezoneValue}>
              Current:{' '}
              <Text style={styles.timezoneHighlight}>
                {profile?.timeZone || 'Not set'}
              </Text>
            </Text>
            {timezoneSaving && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
            {timezoneSaved && (
              <CheckCircle size={16} color={colors.green} />
            )}
            <TouchableOpacity
              onPress={() => {
                setTimezoneOpen(!timezoneOpen)
                setTimezoneSaved(false)
              }}
            >
              <Text style={styles.editLink}>
                {timezoneOpen ? 'Close' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {timezoneOpen && (
            <>
              <TextInput
                style={styles.searchInput}
                value={timezoneSearch}
                onChangeText={setTimezoneSearch}
                placeholder="Search timezones..."
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <View style={styles.timezoneList}>
                {filteredTimezones.map((tz) => (
                  <TouchableOpacity
                    key={tz}
                    style={[
                      styles.timezoneItem,
                      tz === profile?.timeZone && styles.timezoneItemActive,
                    ]}
                    onPress={() => handleTimezoneChange(tz)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.timezoneItemText,
                        tz === profile?.timeZone && styles.timezoneItemTextActive,
                      ]}
                    >
                      {tz}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.hintText}>
            Your timezone affects when habits reset and when you receive
            notifications.
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
    paddingTop: 16,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 12,
    gap: 10,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timezoneValue: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  timezoneHighlight: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  editLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timezoneList: {
    maxHeight: 200,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  timezoneItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timezoneItemActive: {
    backgroundColor: `${colors.primary}20`,
  },
  timezoneItemText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  timezoneItemTextActive: {
    color: colors.primary,
    fontWeight: '500',
  },
  hintText: {
    fontSize: 12,
    color: colors.textMuted,
  },
})
