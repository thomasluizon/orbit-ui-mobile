import { useState, useMemo, useEffect } from 'react'
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
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle,
  X,
} from 'lucide-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userFactKeys } from '@orbit/shared/query'
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
  surfaceOverlay: '#211f33',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#34d399',
  emerald: '#34d399',
  red: '#ef4444',
  blue: '#60a5fa',
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

  // --- AI Memory toggle ---
  const aiMemoryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient('/api/profile/ai-memory', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onMutate: (enabled) => {
      const previous = profile?.aiMemoryEnabled
      patchProfile({ aiMemoryEnabled: enabled })
      return { previous }
    },
    onError: (_err: unknown, _enabled: boolean, context: { previous?: boolean } | undefined) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiMemoryEnabled: context.previous })
      }
    },
  })

  // --- AI Summary toggle ---
  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient('/api/profile/ai-summary', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (_err: unknown, _enabled: boolean, context: { previous?: boolean } | undefined) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
  })

  // --- User Facts ---
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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiClient('/api/user-facts/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      setSelectedFactIds(new Set())
      if (facts.length === 0) setSelectMode(false)
    },
  })

  // Pagination
  const FACTS_PER_PAGE = 5
  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * FACTS_PER_PAGE
    return facts.slice(start, start + FACTS_PER_PAGE)
  }, [facts, factsPage])

  useEffect(() => {
    if (factsPage > totalFactsPages) {
      setFactsPage(totalFactsPages)
    }
  }, [factsPage, totalFactsPages])

  // Selection mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set())

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setSelectedFactIds(new Set())
  }

  function toggleFactSelection(id: string) {
    const next = new Set(selectedFactIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedFactIds(next)
  }

  function toggleSelectAll() {
    if (selectedFactIds.size === facts.length) {
      setSelectedFactIds(new Set())
    } else {
      setSelectedFactIds(new Set(facts.map((f) => f.id)))
    }
  }

  function factCategoryColor(category: string | null): { text: string; bg: string } {
    switch (category?.toLowerCase()) {
      case 'preference':
        return { text: colors.primary, bg: 'rgba(139,92,246,0.10)' }
      case 'routine':
        return { text: colors.emerald, bg: 'rgba(52,211,153,0.10)' }
      case 'context':
        return { text: colors.blue, bg: 'rgba(96,165,250,0.10)' }
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
            Orbit remembers what you share in conversations to give more personalized advice.
          </Text>
          <View style={styles.privacyRow}>
            <ShieldCheck size={14} color={colors.emerald} />
            <Text style={styles.privacyText}>
              Your data is never shared with third parties or used to train models.
            </Text>
          </View>
          <Text
            style={[
              styles.statusText,
              { color: profile?.aiMemoryEnabled ? colors.primary : colors.textMuted },
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
            Get a personalized AI-generated summary of your day based on your habit logs.
          </Text>
          <Text
            style={[
              styles.statusText,
              { color: profile?.aiSummaryEnabled ? colors.primary : colors.textMuted },
            ]}
          >
            {profile?.aiSummaryEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>

        {/* What Orbit Knows -- User Facts */}
        <View style={styles.card}>
          <View style={styles.factsHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>What Orbit Knows</Text>
              {facts.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{facts.length}</Text>
                </View>
              )}
            </View>
            {facts.length > 0 && (
              <TouchableOpacity
                style={styles.selectButton}
                onPress={toggleSelectMode}
              >
                {selectMode ? (
                  <X size={12} color={colors.textSecondary} />
                ) : (
                  <CheckCircle size={12} color={colors.textMuted} />
                )}
                <Text style={[styles.selectButtonText, selectMode && { color: colors.textSecondary }]}>
                  {selectMode ? 'Cancel' : 'Select'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Bulk actions bar */}
          {selectMode && (
            <View style={styles.bulkActionsBar}>
              <TouchableOpacity onPress={toggleSelectAll}>
                <Text style={styles.selectAllText}>
                  {selectedFactIds.size === facts.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteSelectedButton, selectedFactIds.size === 0 && { opacity: 0.3 }]}
                disabled={selectedFactIds.size === 0}
                onPress={() => bulkDeleteMutation.mutate([...selectedFactIds])}
              >
                <Text style={styles.deleteSelectedText}>
                  Delete ({selectedFactIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading state */}
          {factsQuery.isLoading && (
            <View style={{ gap: 12 }}>
              <View style={[styles.skeletonBar, { height: 40, borderRadius: 16 }]} />
              <View style={[styles.skeletonBar, { height: 40, borderRadius: 16 }]} />
            </View>
          )}

          {/* Empty state */}
          {!factsQuery.isLoading && facts.length === 0 && (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={styles.emptyText}>
                No memories yet. Chat with Orbit to start building your profile.
              </Text>
            </View>
          )}

          {/* Facts list */}
          {!factsQuery.isLoading && facts.length > 0 && (
            <View style={{ gap: 8 }}>
              {pagedFacts.map((fact) => {
                const catColor = factCategoryColor(fact.category)
                const isSelected = selectedFactIds.has(fact.id)
                return (
                  <TouchableOpacity
                    key={fact.id}
                    style={[
                      styles.factRow,
                      isSelected && selectMode && styles.factRowSelected,
                    ]}
                    onPress={selectMode ? () => toggleFactSelection(fact.id) : undefined}
                    activeOpacity={selectMode ? 0.7 : 1}
                    disabled={!selectMode}
                  >
                    {selectMode && (
                      <TouchableOpacity
                        style={{ marginTop: 2 }}
                        onPress={() => toggleFactSelection(fact.id)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            isSelected && styles.checkboxChecked,
                          ]}
                        >
                          {isSelected && <Check size={12} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.factText}>{fact.factText}</Text>
                      {fact.category && (
                        <View style={[styles.factCategory, { backgroundColor: catColor.bg }]}>
                          <Text style={[styles.factCategoryText, { color: catColor.text }]}>
                            {fact.category}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!selectMode && (
                      <TouchableOpacity
                        style={styles.factDeleteBtn}
                        onPress={() => deleteMutation.mutate(fact.id)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                )
              })}

              {/* Pagination */}
              {totalFactsPages > 1 && (
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    style={[styles.paginationBtn, factsPage === 1 && { opacity: 0.3 }]}
                    disabled={factsPage === 1}
                    onPress={() => setFactsPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <Text style={styles.paginationText}>
                    {factsPage} / {totalFactsPages}
                  </Text>
                  <TouchableOpacity
                    style={[styles.paginationBtn, factsPage === totalFactsPages && { opacity: 0.3 }]}
                    disabled={factsPage === totalFactsPages}
                    onPress={() => setFactsPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
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
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 18 },
  statusText: { fontSize: 12, fontWeight: '500' },

  // Facts header
  factsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countBadgeText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  selectButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectButtonText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

  // Bulk actions
  bulkActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
  },
  selectAllText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  deleteSelectedButton: {
    backgroundColor: colors.red,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deleteSelectedText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Skeleton
  skeletonBar: {
    backgroundColor: colors.surfaceElevated,
    width: '100%',
  },

  // Empty
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  // Fact row
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 12,
  },
  factRowSelected: {
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.40)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  factText: { fontSize: 14, color: colors.textPrimary },
  factCategory: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 4,
  },
  factCategoryText: { fontSize: 10, fontWeight: '600' },
  factDeleteBtn: {
    padding: 6,
    borderRadius: 999,
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 4,
  },
  paginationBtn: {
    padding: 6,
    borderRadius: 999,
  },
  paginationText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
})
