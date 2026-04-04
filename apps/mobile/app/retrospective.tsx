import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useQuery } from '@tanstack/react-query'
import { format, subWeeks, addWeeks, startOfWeek, endOfWeek } from 'date-fns'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
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
}

// ---------------------------------------------------------------------------
// Retrospective Screen
// ---------------------------------------------------------------------------

export default function RetrospectiveScreen() {
  const router = useRouter()
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()))

  const weekStart = formatAPIDate(currentWeek)
  const weekEnd = formatAPIDate(endOfWeek(currentWeek))
  const periodLabel = `${format(currentWeek, 'MMM d')} - ${format(endOfWeek(currentWeek), 'MMM d, yyyy')}`

  const { data, isLoading, error } = useQuery({
    queryKey: habitKeys.retrospective(weekStart),
    queryFn: () =>
      apiClient<{ retrospective: string }>(
        `/api/habits/retrospective?period=week&date=${weekStart}`,
      ),
    staleTime: 10 * 60 * 1000,
  })

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
          <Text style={styles.headerTitle}>Retrospective</Text>
        </View>

        {/* Week navigation */}
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={styles.weekNavButton}
            onPress={() => setCurrentWeek((w) => subWeeks(w, 1))}
            activeOpacity={0.7}
          >
            <ChevronLeft size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{periodLabel}</Text>
          <TouchableOpacity
            style={styles.weekNavButton}
            onPress={() => setCurrentWeek((w) => addWeeks(w, 1))}
            activeOpacity={0.7}
          >
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>
              Generating your retrospective...
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              Failed to generate retrospective. This feature requires a Pro
              subscription and completed habits for the selected week.
            </Text>
          </View>
        )}

        {data?.retrospective && (
          <View style={styles.retroCard}>
            <View style={styles.retroHeader}>
              <Sparkles size={18} color={colors.primary} />
              <Text style={styles.retroLabel}>AI Retrospective</Text>
            </View>
            <Text style={styles.retroText}>{data.retrospective}</Text>
          </View>
        )}
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
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 16,
  },
  weekNavButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  retroCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    padding: 20,
    gap: 12,
  },
  retroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retroLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  retroText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
  },
})
