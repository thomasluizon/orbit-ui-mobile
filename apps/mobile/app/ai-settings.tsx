import { useState, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
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
import { API } from '@orbit/shared/api'
import { userFactKeys } from '@orbit/shared/query'
import {
  normalizeUserFactCategory,
  USER_FACTS_PER_PAGE,
} from '@orbit/shared/utils'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOffline } from '@/hooks/use-offline'
import { spacing } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

interface UserFact {
  id: string
  factText: string
  category: string | null
}

// ---------------------------------------------------------------------------
// AI Settings Screen
// ---------------------------------------------------------------------------

export default function AiSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMemoryEnabled = hasProAccess && (profile?.aiMemoryEnabled ?? false)
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)

  // --- AI Memory toggle ---
  const aiMemoryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      performQueuedApiMutation({
        type: 'setAiMemory',
        scope: 'profile',
        endpoint: API.profile.aiMemory,
        method: 'PUT',
        payload: { enabled },
        dedupeKey: 'profile-ai-memory',
      }),
    onMutate: (enabled) => {
      const previous = profile?.aiMemoryEnabled
      patchProfile({ aiMemoryEnabled: enabled })
      return { previous }
    },
    onError: (
      _err: unknown,
      _enabled: boolean,
      context: { previous?: boolean } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiMemoryEnabled: context.previous })
      }
    },
  })

  // --- AI Summary toggle ---
  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      performQueuedApiMutation({
        type: 'setAiSummary',
        scope: 'profile',
        endpoint: API.profile.aiSummary,
        method: 'PUT',
        payload: { enabled },
        dedupeKey: 'profile-ai-summary',
      }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (
      _err: unknown,
      _enabled: boolean,
      context: { previous?: boolean } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
  })

  // --- User Facts ---
  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: () => apiClient<UserFact[]>(API.userFacts.list),
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const facts = useMemo(
    () => (hasProAccess ? (factsQuery.data ?? []) : []),
    [factsQuery.data, hasProAccess],
  )
  const { isOnline } = useOffline()

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      performQueuedApiMutation({
        type: 'deleteUserFact',
        scope: 'userFacts',
        endpoint: API.userFacts.delete(id),
        method: 'DELETE',
        payload: undefined,
        targetEntityId: id,
        dedupeKey: `user-fact-delete-${id}`,
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: userFactKeys.lists() })
      const previous = queryClient.getQueryData<UserFact[]>(
        userFactKeys.lists(),
      )
      queryClient.setQueryData<UserFact[]>(userFactKeys.lists(), (old) =>
        old ? old.filter((fact) => fact.id !== id) : old,
      )
      return { previous }
    },
    onError: (_err, _id, context: { previous?: UserFact[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(userFactKeys.lists(), context.previous)
      }
    },
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      }
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      performQueuedApiMutation({
        type: 'bulkDeleteUserFacts',
        scope: 'userFacts',
        endpoint: API.userFacts.bulk,
        method: 'DELETE',
        payload: { ids },
        dedupeKey: 'bulk-delete-user-facts',
      }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: userFactKeys.lists() })
      const previous = queryClient.getQueryData<UserFact[]>(
        userFactKeys.lists(),
      )
      queryClient.setQueryData<UserFact[]>(userFactKeys.lists(), (old) =>
        old ? old.filter((fact) => !ids.includes(fact.id)) : old,
      )
      return { previous }
    },
    onError: (_err, _ids, context: { previous?: UserFact[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(userFactKeys.lists(), context.previous)
      }
    },
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      }
      setSelectedFactIds(new Set())
      const remaining =
        queryClient.getQueryData<UserFact[]>(userFactKeys.lists()) ?? []
      if (remaining.length === 0) setSelectMode(false)
    },
  })

  // Pagination
  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / USER_FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * USER_FACTS_PER_PAGE
    return facts.slice(start, start + USER_FACTS_PER_PAGE)
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

  function factCategoryColor(category: string | null): {
    text: string
    bg: string
  } {
    switch (normalizeUserFactCategory(category)) {
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goBackOrFallback('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('aiSettings.title')}</Text>
        </View>

        {/* AI Memory */}
        <View style={styles.card}>
          <View style={styles.toggleHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>
                {t('profile.aiMemory.title')}
              </Text>
              <ProBadge alwaysVisible />
            </View>
            {hasProAccess ? (
              <Switch
                value={aiMemoryEnabled}
                onValueChange={(value) => aiMemoryMutation.mutate(value)}
                trackColor={{
                  false: colors.surfaceElevated,
                  true: colors.primary,
                }}
                thumbColor="#fff"
                disabled={aiMemoryMutation.isPending}
              />
            ) : (
              <TouchableOpacity
                onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
                style={styles.lockRow}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={styles.lockText}>
                  {t('common.proBadge').toUpperCase()}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.cardDescription}>
            {t('profile.aiMemory.description')}
          </Text>
          <View style={styles.privacyRow}>
            <ShieldCheck size={14} color={colors.emerald} />
            <Text style={styles.privacyText}>
              {t('profile.aiMemory.privacy')}
            </Text>
          </View>
          <Text
            style={[
              styles.statusText,
              { color: aiMemoryEnabled ? colors.primary : colors.textMuted },
            ]}
          >
            {aiMemoryEnabled
              ? t('profile.aiMemory.enabled')
              : t('profile.aiMemory.disabled')}
          </Text>
        </View>

        {/* AI Summary */}
        <View style={styles.card}>
          <View style={styles.toggleHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>
                {t('profile.aiSummary.title')}
              </Text>
              <ProBadge alwaysVisible />
            </View>
            {hasProAccess ? (
              <Switch
                value={aiSummaryEnabled}
                onValueChange={(value) => aiSummaryMutation.mutate(value)}
                trackColor={{
                  false: colors.surfaceElevated,
                  true: colors.primary,
                }}
                thumbColor="#fff"
                disabled={aiSummaryMutation.isPending}
              />
            ) : (
              <TouchableOpacity
                onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
                style={styles.lockRow}
              >
                <Lock size={14} color={colors.primary} />
                <Text style={styles.lockText}>
                  {t('common.proBadge').toUpperCase()}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.cardDescription}>
            {t('profile.aiSummary.description')}
          </Text>
          <Text
            style={[
              styles.statusText,
              { color: aiSummaryEnabled ? colors.primary : colors.textMuted },
            ]}
          >
            {aiSummaryEnabled
              ? t('profile.aiSummary.enabled')
              : t('profile.aiSummary.disabled')}
          </Text>
        </View>

        {/* What Orbit Knows -- User Facts */}
        <View style={styles.card}>
          <View style={styles.factsHeader}>
            <View style={styles.labelRow}>
              <Text style={styles.cardLabel}>{t('profile.facts.title')}</Text>
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
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  selectMode ? t('common.cancel') : t('profile.facts.select')
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {selectMode ? (
                  <X size={12} color={colors.textSecondary} />
                ) : (
                  <CheckCircle size={12} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Bulk actions bar */}
          {selectMode && (
            <View style={styles.bulkActionsBar}>
              <TouchableOpacity onPress={toggleSelectAll}>
                <Text style={styles.selectAllText}>
                  {selectedFactIds.size === facts.length
                    ? t('profile.facts.deselectAll')
                    : t('profile.facts.selectAll')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteSelectedButton,
                  selectedFactIds.size === 0 && { opacity: 0.3 },
                ]}
                disabled={selectedFactIds.size === 0}
                onPress={() => bulkDeleteMutation.mutate([...selectedFactIds])}
              >
                <Text style={styles.deleteSelectedText}>
                  {t('profile.facts.deleteSelected', {
                    n: selectedFactIds.size,
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Loading state */}
          {factsQuery.isLoading && (
            <View style={{ gap: 12 }}>
              <View
                style={[styles.skeletonBar, { height: 40, borderRadius: 16 }]}
              />
              <View
                style={[styles.skeletonBar, { height: 40, borderRadius: 16 }]}
              />
            </View>
          )}

          {/* Empty state */}
          {!factsQuery.isLoading && facts.length === 0 && (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Text style={styles.emptyText}>{t('profile.facts.empty')}</Text>
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
                    onPress={
                      selectMode
                        ? () => toggleFactSelection(fact.id)
                        : undefined
                    }
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
                            {t(
                              `profile.facts.${fact.category?.toLowerCase()}`,
                              { defaultValue: fact.category },
                            )}
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
                    style={[
                      styles.paginationBtn,
                      factsPage === 1 && { opacity: 0.3 },
                    ]}
                    disabled={factsPage === 1}
                    onPress={() => setFactsPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  <Text style={styles.paginationText}>
                    {factsPage} / {totalFactsPages}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.paginationBtn,
                      factsPage === totalFactsPages && { opacity: 0.3 },
                    ]}
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

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.pageX,
      paddingBottom: spacing.pageBottom,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.cardGap,
      paddingTop: spacing.sectionGap * 2,
      paddingBottom: spacing.cardGap * 2,
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
      padding: spacing.cardPadding,
      marginBottom: spacing.cardGap,
      gap: spacing.cardGap,
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
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lockText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    cardDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    privacyText: {
      fontSize: 12,
      color: colors.textMuted,
      flex: 1,
      lineHeight: 18,
    },
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
    countBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textMuted,
    },
    selectButton: {
      width: 32,
      height: 32,
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },

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
    paginationText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  })
}
