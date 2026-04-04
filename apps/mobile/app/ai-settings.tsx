import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  ShieldCheck,
  Trash2,
  Lock,
} from 'lucide-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userFactKeys } from '@orbit/shared/query'
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
  red: '#ef4444',
}

interface UserFact {
  id: string
  factText: string
  category: string | null
}

// ---------------------------------------------------------------------------
// AI Settings Screen
// ---------------------------------------------------------------------------

export default function AiSettingsScreen() {
  const router = useRouter()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()

  // AI Memory toggle
  const aiMemoryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient('/api/profile/ai-memory', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onMutate: (enabled) => {
      patchProfile({ aiMemoryEnabled: enabled })
    },
  })

  // AI Summary toggle
  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient('/api/profile/ai-summary', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onMutate: (enabled) => {
      patchProfile({ aiSummaryEnabled: enabled })
    },
  })

  // User Facts
  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: () => apiClient<UserFact[]>('/api/user-facts'),
    staleTime: 5 * 60 * 1000,
  })

  const facts = factsQuery.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/user-facts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
    },
  })

  function factCategoryColor(category: string | null) {
    switch (category?.toLowerCase()) {
      case 'preference':
        return { text: colors.primary, bg: `${colors.primary}15` }
      case 'routine':
        return { text: colors.green, bg: `${colors.green}15` }
      case 'context':
        return { text: '#3b82f6', bg: 'rgba(59,130,246,0.15)' }
      default:
        return { text: colors.textSecondary, bg: colors.surfaceElevated }
    }
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
          <Text style={styles.headerTitle}>AI Features</Text>
        </View>

        {/* AI Memory */}
        <View style={styles.card}>
          <View style={styles.toggleHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>AI Memory</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            {profile?.hasProAccess ? (
              <Switch
                value={profile?.aiMemoryEnabled ?? false}
                onValueChange={(v) => aiMemoryMutation.mutate(v)}
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor="#fff"
                disabled={aiMemoryMutation.isPending}
              />
            ) : (
              <TouchableOpacity
                onPress={() => router.push('/upgrade')}
                style={styles.lockRow}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={styles.lockText}>PRO</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.cardDescription}>
            Orbit remembers what you share in conversations to give more
            personalized advice.
          </Text>
          <View style={styles.privacyRow}>
            <ShieldCheck size={14} color={colors.green} />
            <Text style={styles.privacyText}>
              Your data is never shared with third parties or used to train
              models.
            </Text>
          </View>
          <Text
            style={[
              styles.statusText,
              {
                color: profile?.aiMemoryEnabled
                  ? colors.primary
                  : colors.textMuted,
              },
            ]}
          >
            {profile?.aiMemoryEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>

        {/* AI Summary */}
        <View style={styles.card}>
          <View style={styles.toggleHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>AI Daily Summary</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            {profile?.hasProAccess ? (
              <Switch
                value={profile?.aiSummaryEnabled ?? false}
                onValueChange={(v) => aiSummaryMutation.mutate(v)}
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor="#fff"
                disabled={aiSummaryMutation.isPending}
              />
            ) : (
              <TouchableOpacity
                onPress={() => router.push('/upgrade')}
                style={styles.lockRow}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={styles.lockText}>PRO</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.cardDescription}>
            Get a personalized AI-generated summary of your day based on your
            habit logs.
          </Text>
          <Text
            style={[
              styles.statusText,
              {
                color: profile?.aiSummaryEnabled
                  ? colors.primary
                  : colors.textMuted,
              },
            ]}
          >
            {profile?.aiSummaryEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>

        {/* User Facts */}
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.cardLabel}>What Orbit Knows</Text>
            {facts.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{facts.length}</Text>
              </View>
            )}
          </View>

          {factsQuery.isLoading && (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ paddingVertical: 20 }}
            />
          )}

          {!factsQuery.isLoading && facts.length === 0 && (
            <Text style={styles.emptyText}>
              No memories yet. Chat with Orbit to start building your profile.
            </Text>
          )}

          {!factsQuery.isLoading &&
            facts.map((fact) => {
              const catColor = factCategoryColor(fact.category)
              return (
                <View key={fact.id} style={styles.factRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.factText}>{fact.factText}</Text>
                    {fact.category && (
                      <View
                        style={[
                          styles.factCategory,
                          { backgroundColor: catColor.bg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.factCategoryText,
                            { color: catColor.text },
                          ]}
                        >
                          {fact.category}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.factDelete}
                    onPress={() => deleteMutation.mutate(fact.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )
            })}
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
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
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
  proBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  statusText: { fontSize: 12, fontWeight: '500' },
  countBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  factText: { fontSize: 14, color: colors.textPrimary },
  factCategory: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  factCategoryText: { fontSize: 10, fontWeight: '600' },
  factDelete: { padding: 6 },
})
