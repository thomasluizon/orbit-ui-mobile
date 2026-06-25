import { useMemo } from 'react'
import { View, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { createStyles } from './ai-settings-styles'
import { useUserFacts } from './use-user-facts'
import {
  AiFeatureToggles,
  FactsSelectBar,
  UserFactsList,
} from './ai-settings-sections'

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

  const {
    factsQuery,
    facts,
    pagedFacts,
    selectMode,
    selectedFactIds,
    deleteMutation,
    bulkDeleteMutation,
    factsPage,
    setFactsPage,
    totalFactsPages,
    toggleSelectMode,
    toggleFactSelection,
    toggleSelectAll,
  } = useUserFacts(hasProAccess)

  const showPaging = totalFactsPages > 1 && !selectMode

  const factsTrailing =
    !hasProAccess || facts.length === 0 ? undefined : (
      <FactsSelectBar
        tokens={tokens}
        t={t}
        styles={styles}
        selectMode={selectMode}
        selectedCount={selectedFactIds.size}
        allSelected={selectedFactIds.size === facts.length}
        bulkDeletePending={bulkDeleteMutation.isPending}
        showPaging={showPaging}
        page={factsPage}
        totalPages={totalFactsPages}
        onPreviousPage={() => setFactsPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setFactsPage((p) => Math.min(totalFactsPages, p + 1))}
        onToggleSelectAll={toggleSelectAll}
        onBulkDelete={() => bulkDeleteMutation.mutate([...selectedFactIds])}
        onToggleSelectMode={toggleSelectMode}
      />
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
        <AiFeatureToggles
          tokens={tokens}
          t={t}
          hasProAccess={hasProAccess}
          aiMemoryEnabled={aiMemoryEnabled}
          aiSummaryEnabled={aiSummaryEnabled}
          memoryPending={aiMemoryMutation.isPending}
          summaryPending={aiSummaryMutation.isPending}
          onToggleMemory={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
          onToggleSummary={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
          onUpgrade={() => router.push(buildUpgradeHref('/ai-settings'))}
        />

        <SectionLabel trailing={factsTrailing}>
          {t('profile.facts.title')}
        </SectionLabel>

        <UserFactsList
          tokens={tokens}
          t={t}
          styles={styles}
          hasProAccess={hasProAccess}
          factsQuery={factsQuery}
          facts={facts}
          pagedFacts={pagedFacts}
          selectMode={selectMode}
          selectedFactIds={selectedFactIds}
          onToggleSelection={toggleFactSelection}
          onDelete={(id) => deleteMutation.mutate(id)}
          onAskAstra={() => router.push('/chat')}
        />

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
