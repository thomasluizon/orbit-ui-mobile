import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Lock,
  Satellite,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys, userFactKeys } from '@orbit/shared/query'
import {
  normalizeUserFactCategory,
  USER_FACTS_PER_PAGE,
} from '@orbit/shared/utils'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOffline } from '@/hooks/use-offline'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { SelectCheck } from '@/components/ui/select-check'
import { ProBadge } from '@/components/ui/pro-badge'

interface UserFact {
  id: string
  factText: string
  category: string | null
}

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
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
        style={({ pressed }) => [
          styles.pageBtn,
          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          pressed ? styles.pageBtnPressed : null,
        ]}
      >
        <ChevronLeft
          size={18}
          strokeWidth={1.8}
          color={factsPage === 1 ? tokens.fg4 : tokens.fg2}
        />
      </Pressable>
      <Pressable
        onPress={() => setFactsPage((p) => Math.min(totalFactsPages, p + 1))}
        disabled={factsPage === totalFactsPages}
        accessibilityRole="button"
        accessibilityLabel={t('common.next')}
        style={({ pressed }) => [
          styles.pageBtn,
          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          pressed ? styles.pageBtnPressed : null,
        ]}
      >
        <ChevronRight
          size={18}
          strokeWidth={1.8}
          color={factsPage === totalFactsPages ? tokens.fg4 : tokens.fg2}
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
        <SectionLabel bottom={4} trailing={<ProBadge />}>
          {t('profile.sections.aiFeatures')}
        </SectionLabel>
        {hasProAccess ? (
          <SettingsRow
            icon={Brain}
            label={t('profile.aiMemory.title')}
            desc={t('profile.aiMemory.description')}
            accessory="none"
            divider={false}
          >
            <Switch
              on={aiMemoryEnabled}
              onToggle={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
              disabled={aiMemoryMutation.isPending}
              accessibilityLabel={t('profile.aiMemory.title')}
            />
          </SettingsRow>
        ) : (
          <SettingsRow
            icon={Brain}
            label={t('profile.aiMemory.title')}
            desc={t('profile.aiMemory.description')}
            onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
            accessory="chevron"
            divider={false}
          >
            <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
          </SettingsRow>
        )}
        {hasProAccess ? (
          <SettingsRow
            icon={Satellite}
            label={t('profile.aiSummary.title')}
            desc={t('profile.aiSummary.description')}
            accessory="none"
            divider={false}
          >
            <Switch
              on={aiSummaryEnabled}
              onToggle={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              disabled={aiSummaryMutation.isPending}
              accessibilityLabel={t('profile.aiSummary.title')}
            />
          </SettingsRow>
        ) : (
          <SettingsRow
            icon={Satellite}
            label={t('profile.aiSummary.title')}
            desc={t('profile.aiSummary.description')}
            onPress={() => router.push(buildUpgradeHref('/ai-settings'))}
            accessory="chevron"
            divider={false}
          >
            <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
          </SettingsRow>
        )}

        <SectionLabel
          trailing={hasProAccess && totalFactsPages > 1 ? pagingTrailing : undefined}
        >
          {t('profile.facts.title')}
        </SectionLabel>

        {!hasProAccess ? (
          <View style={styles.lockedBlock}>
            <Text style={[styles.lockedText, { color: tokens.fg3 }]}>
              {t('profile.facts.lockedHint')}
            </Text>
          </View>
        ) : factsQuery.isLoading ? (
          <View style={styles.skelStack}>
            <View
              style={[styles.skelBar, { backgroundColor: tokens.bgElev }]}
            />
            <View
              style={[styles.skelBar, { backgroundColor: tokens.bgElev }]}
            />
          </View>
        ) : factsQuery.error ? (
          <View style={styles.emptyBlock} accessibilityRole="alert">
            <SatelliteGlyph size={104} />
            <Text style={[styles.emptyBody, { color: tokens.statusBad }]}>
              {t('profile.facts.factsError')}
            </Text>
            <PillButton fullWidth onPress={() => factsQuery.refetch()}>
              {t('profile.facts.retry')}
            </PillButton>
          </View>
        ) : facts.length === 0 ? (
          <View style={styles.emptyBlock}>
            <SatelliteGlyph size={104} />
            <Text style={[styles.emptyBody, { color: tokens.fg2 }]}>
              {t('profile.facts.empty')}
            </Text>
            <PillButton
              fullWidth
              onPress={() => router.push('/chat')}
              leading={
                <Sparkles size={18} color={tokens.fgOnPrimary} strokeWidth={1.8} />
              }
            >
              {t('summary.askAstra')}
            </PillButton>
          </View>
        ) : (
          <>
            {selectMode ? (
              <View style={styles.selectBar}>
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
                    style={({ pressed }) => [
                      styles.actionChip,
                      {
                        backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                        borderColor: tokens.hairline,
                      },
                      pressed ? styles.actionChipPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.selectActionText, { color: tokens.fg2 }]}
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
                    style={({ pressed }) => [
                      styles.actionChip,
                      {
                        backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                        borderColor: tokens.hairline,
                      },
                      pressed ? styles.actionChipPressed : null,
                      selectedFactIds.size === 0 && { opacity: 0.45 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectActionText,
                        { color: tokens.statusBad },
                      ]}
                    >
                      {t('profile.facts.deleteSelectedShort')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={toggleSelectMode}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.facts.cancel')}
                    style={({ pressed }) => [
                      styles.cancelBtn,
                      { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
                      pressed ? styles.actionChipPressed : null,
                    ]}
                  >
                    <X size={18} color={tokens.fg3} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.factsHeader}>
                <Pressable
                  onPress={toggleSelectMode}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.facts.select')}
                  style={({ pressed }) => [
                    styles.actionChip,
                    {
                      backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                      borderColor: tokens.hairline,
                    },
                    pressed ? styles.actionChipPressed : null,
                  ]}
                >
                  <Text
                    style={[styles.selectActionText, { color: tokens.fg2 }]}
                  >
                    {t('profile.facts.select')}
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.factsList}>
              {pagedFacts.map((fact, index) => {
                const selected = selectedFactIds.has(fact.id)
                return (
                  <Animated.View key={fact.id} entering={rowEntrance(index)}>
                  <Pressable
                    onPress={
                      selectMode ? () => toggleFactSelection(fact.id) : undefined
                    }
                    accessibilityRole={selectMode ? 'checkbox' : 'none'}
                    accessibilityState={
                      selectMode ? { checked: selected } : undefined
                    }
                    style={({ pressed }) => [
                      styles.factCard,
                      selected && selectMode
                        ? {
                            backgroundColor: tintFromPrimary(tokens, 0.08),
                            borderColor: tintFromPrimary(tokens, 0.28),
                          }
                        : {
                            backgroundColor:
                              pressed && selectMode
                                ? tokens.bgElevPressed
                                : tokens.bgCard,
                            borderColor: tokens.hairline,
                          },
                      pressed && selectMode ? styles.factCardPressed : null,
                    ]}
                  >
                    {selectMode ? (
                      <View style={styles.checkSlot}>
                        <SelectCheck
                          selected={selected}
                          size={18}
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
                            style={[styles.categoryText, { color: tokens.fg3 }]}
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
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={({ pressed }) => [
                          styles.deleteBtn,
                          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
                          pressed ? styles.actionChipPressed : null,
                        ]}
                      >
                        {({ pressed }) => (
                          <Trash2
                            size={18}
                            color={pressed ? tokens.statusBad : tokens.fg4}
                            strokeWidth={1.8}
                          />
                        )}
                      </Pressable>
                    ) : null}
                  </Pressable>
                  </Animated.View>
                )
              })}
            </View>
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
    lockedBlock: {
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    lockedText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
    },
    emptyBlock: {
      alignItems: 'center',
      paddingHorizontal: 36,
      paddingVertical: 40,
      gap: 18,
    },
    emptyBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22.5,
      textAlign: 'center',
      maxWidth: 320,
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
    pageBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBtnPressed: {
      transform: [{ scale: 0.92 }],
    },
    skelStack: {
      paddingHorizontal: 20,
      gap: 10,
    },
    skelBar: {
      height: 56,
      borderRadius: 16,
    },
    factsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingBottom: 6,
    },
    selectBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    selectedCount: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    selectActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 9,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionChipPressed: {
      transform: [{ scale: 0.96 }],
    },
    cancelBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectActionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    factsList: {
      paddingHorizontal: 20,
      gap: 10,
    },
    factCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    factCardPressed: {
      transform: [{ scale: 0.99 }],
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
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
    },
    categoryText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10,
      letterSpacing: 0.6,
    },
    factText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 21.75,
    },
    deleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
