import React from 'react'
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
import { ArrowLeft, Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'

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

const PERIODS: RetrospectivePeriod[] = ['week', 'month', 'quarter', 'semester', 'year']

export default function RetrospectiveScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const {
    retrospective,
    isLoading,
    error,
    fromCache,
    period,
    setPeriod,
    generate,
  } = useRetrospective()

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
          <Text style={styles.headerTitle}>{t('retrospective.title')}</Text>
        </View>

        {/* Period selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodScroll}
          contentContainerStyle={styles.periodScrollContent}
        >
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodChipText, period === p && styles.periodChipTextActive]}>
                {t(`retrospective.periods.${p}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateButton, isLoading && styles.generateButtonDisabled]}
          onPress={generate}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Sparkles size={16} color="#fff" />
          )}
          <Text style={styles.generateButtonText}>{t('retrospective.generate')}</Text>
        </TouchableOpacity>

        {/* Content */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>
              {t('retrospective.generating')}
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {retrospective && (
          <View style={styles.retroCard}>
            <View style={styles.retroHeader}>
              <Sparkles size={18} color={colors.primary} />
              <Text style={styles.retroLabel}>
                {t('retrospective.aiTitle')}
                {fromCache && <Text style={styles.cacheIndicator}> ({t('retrospective.cached')})</Text>}
              </Text>
            </View>
            <Text style={styles.retroText}>{retrospective}</Text>
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
  periodScroll: {
    marginBottom: 12,
  },
  periodScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  periodChipTextActive: {
    color: '#fff',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cacheIndicator: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
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
