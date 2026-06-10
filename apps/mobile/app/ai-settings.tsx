import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Orbit,
  Trash2,
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { SettingsDescription } from '@/components/ui/settings-description'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { SelectCheck } from '@/components/ui/select-check'

interface UserFact {
  id: string
  factText: string
  category: string | null
}

export default function AiSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(), [])
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMemoryEnabled = hasProAccess && (profile?.aiMemoryEnabled ?? false)
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)

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

  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / USER_FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * USER_FACTS_PER_PAGE
    return facts.slice(start, start + USER_FACTS_PER_PAGE)
  }, [facts, factsPage])

  if (factsPage > totalFactsPages && totalFactsPages >= 1) {
    setFactsPage(totalFactsPages)
  }

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

  function categoryLabel(category: string | null): string {
    const norm = normalizeUserFactCategory(category) ?? 'context'
    return t(`profile.facts.${norm}`, { defaultValue: norm }).toUpperCase()
  }

  const factsTrailing = (
    <View style={styles.factsTrailing}>
      <Text style={[styles.factsPageMono, { color: tokens.fg3 }]}>
        {t('profile.facts.title')}
      </Text>
    </View>
  )

  const pagingTrailing = (
    <View style={styles.pagingRow}>
      <Text style={[styles.pagingText, { color: tokens.fg3 }]}>
        <Text style={{ color: tokens.fg1 }}>{factsPage}</Text> / {totalFactsPages}
      </Text>
      <Pressable
        onPress={() => setFactsPage((p) => Math.max(1, p - 1))}
        disabled={factsPage === 1}
        accessibilityRole="button"
        accessibilityLabel={t('common.previous')}
        style={styles.pageBtn}
      >
        <ChevronLeft
          size={14}
          color={factsPage === 1 ? tokens.fg4 : tokens.fg3}
        />
      </Pressable>
      <Pressable
        onPress={() => setFactsPage((p) => Math.min(totalFactsPages, p + 1))}
        disabled={factsPage === totalFactsPages}
        accessibilityRole="button"
        accessibilityLabel={t('common.next')}
        style={styles.pageBtn}
      >
        <ChevronRight
          size={14}
          color={factsPage === totalFactsPages ? tokens.fg4 : tokens.fg3}
        />
      </Pressable>
    </View>
  )

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('aiSettings.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t('profile.aiMemory.title')}</SectionLabel>
        {hasProAccess ? (
          <SettingsRow
            label={t('profile.aiMemory.title')}
            accessory="none"
            divider={false}
          >
            <MonoToggle
              on={aiMemoryEnabled}
              onPress={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
              disabled={aiMemoryMutation.isPending}
              accessibilityLabel={t('profile.aiMemory.title')}
            />
          </SettingsRow>
        ) : (
          <SettingsRow
            label={t('profile.aiMemory.title')}
            onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
            accessory="chevron"
            divider={false}
          >
            <Lock size={14} color={tokens.fg3} strokeWidth={1.4} />
          </SettingsRow>
        )}
        <SettingsDescription>{t('profile.aiMemory.description')}</SettingsDescription>

        <SectionLabel>{t('profile.aiSummary.title')}</SectionLabel>
        {hasProAccess ? (
          <SettingsRow
            label={t('profile.aiSummary.title')}
            accessory="none"
            divider={false}
          >
            <MonoToggle
              on={aiSummaryEnabled}
              onPress={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              disabled={aiSummaryMutation.isPending}
              accessibilityLabel={t('profile.aiSummary.title')}
            />
          </SettingsRow>
        ) : (
          <SettingsRow
            label={t('profile.aiSummary.title')}
            onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
            accessory="chevron"
            divider={false}
          >
            <Lock size={14} color={tokens.fg3} strokeWidth={1.4} />
          </SettingsRow>
        )}
        <SettingsDescription>{t('profile.aiSummary.description')}</SettingsDescription>

        <SectionLabel
          trailing={
            hasProAccess && totalFactsPages > 1 ? pagingTrailing : factsTrailing
          }
        >
          {t('profile.facts.title')}
        </SectionLabel>

        {!hasProAccess ? (
          <View style={styles.italicBlock}>
            <Text style={[styles.italicText, { color: tokens.fg3 }]}>
              {t('profile.facts.lockedHint')}
            </Text>
          </View>
        ) : factsQuery.isLoading ? (
          <View style={styles.skelStack}>
            <View
              style={[styles.skelBar, { backgroundColor: tokens.bgSunk }]}
            />
            <View
              style={[styles.skelBar, { backgroundColor: tokens.bgSunk }]}
            />
          </View>
        ) : facts.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Orbit size={26} color={tokens.fg3} strokeWidth={1.4} />
            <Text
              style={[styles.emptyText, { color: tokens.fg3 }]}
            >
              {t('profile.facts.empty')}
            </Text>
          </View>
        ) : (
          <>
            {selectMode ? (
              <View
                style={[
                  styles.selectBar,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <Text
                  style={[styles.selectedCount, { color: tokens.fg1 }]}
                >
                  {t('profile.facts.selectedCount', {
                    n: selectedFactIds.size,
                  })}
                </Text>
                <View style={styles.selectActions}>
                  <Pressable
                    onPress={toggleSelectAll}
                    accessibilityRole="button"
                    style={styles.selectActionPress}
                  >
                    <Text
                      style={[styles.selectActionText, { color: tokens.fg1 }]}
                    >
                      {selectedFactIds.size === facts.length
                        ? t('profile.facts.deselectAll')
                        : t('profile.facts.selectAll')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      bulkDeleteMutation.mutate([...selectedFactIds])
                    }
                    disabled={selectedFactIds.size === 0}
                    accessibilityRole="button"
                    style={styles.selectActionPress}
                  >
                    <Text
                      style={[
                        styles.selectActionItalic,
                        { color: tokens.fg3 },
                        selectedFactIds.size === 0 && { opacity: 0.45 },
                      ]}
                    >
                      {t('profile.facts.deleteSelectedShort')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={toggleSelectMode}
                    accessibilityRole="button"
                    style={styles.selectActionPress}
                  >
                    <X size={14} color={tokens.fg3} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.factsHeader,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <Pressable
                  onPress={toggleSelectMode}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.facts.select')}
                  style={styles.selectActionPress}
                >
                  <Text
                    style={[styles.selectActionText, { color: tokens.fg3 }]}
                  >
                    {t('profile.facts.select')}
                  </Text>
                </Pressable>
              </View>
            )}

            {pagedFacts.map((fact) => {
              const selected = selectedFactIds.has(fact.id)
              return (
                <Pressable
                  key={fact.id}
                  onPress={
                    selectMode ? () => toggleFactSelection(fact.id) : undefined
                  }
                  accessibilityRole={selectMode ? 'checkbox' : 'none'}
                  accessibilityState={
                    selectMode ? { checked: selected } : undefined
                  }
                  style={({ pressed }) => [
                    styles.factRow,
                    {
                      borderBottomColor: tokens.hairline,
                      backgroundColor:
                        selected && selectMode
                          ? tokens.bgSunk
                          : pressed && selectMode
                            ? tokens.bgElev
                            : 'transparent',
                    },
                  ]}
                >
                  {selectMode ? (
                    <View style={styles.checkSlot}>
                      <SelectCheck
                        selected={selected}
                        size={16}
                        onPress={() => toggleFactSelection(fact.id)}
                      />
                    </View>
                  ) : null}
                  <View style={styles.factBody}>
                    {fact.category ? (
                      <View
                        style={[
                          styles.categoryPill,
                          { borderColor: tokens.hairlineStrong },
                        ]}
                      >
                        <Text
                          style={[styles.categoryText, { color: tokens.fg2 }]}
                        >
                          {categoryLabel(fact.category)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.factText, { color: tokens.fg1 }]}>
                      {fact.factText}
                    </Text>
                  </View>
                  {!selectMode ? (
                    <Pressable
                      onPress={() => deleteMutation.mutate(fact.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.facts.delete')}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={14} color={tokens.fg4} strokeWidth={1.5} />
                    </Pressable>
                  ) : null}
                </Pressable>
              )
            })}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    italicBlock: {
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    italicText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      fontStyle: 'italic',
    },
    factsTrailing: { display: 'none' },
    factsPageMono: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
    },
    pagingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pagingText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    pageBtn: { padding: 4 },
    skelStack: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
    },
    skelBar: {
      height: 56,
      borderRadius: 8,
    },
    emptyBlock: {
      paddingHorizontal: 24,
      paddingVertical: 40,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 22,
    },
    factsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    selectBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    selectedCount: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      },
    selectActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    selectActionPress: { padding: 4 },
    selectActionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      },
    selectActionItalic: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      fontStyle: 'italic',
    },
    factRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkSlot: {
      paddingTop: 2,
    },
    factBody: {
      flex: 1,
      gap: 6,
    },
    categoryPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
    },
    categoryText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10,
      letterSpacing: 0.6,
    },
    factText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
    },
    deleteBtn: {
      padding: 4,
    },
  })
}

