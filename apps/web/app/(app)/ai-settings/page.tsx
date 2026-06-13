'use client'

import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { updateAiMemory, updateAiSummary } from '@/app/actions/profile'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AiFeatureToggles } from './_components/ai-feature-toggles'
import { ProUpgradeLink } from './_components/pro-upgrade-link'
import { FactsSelectBar } from './_components/facts-select-bar'
import { FactsPagination } from './_components/facts-pagination'
import { UserFactsList } from './_components/user-facts-list'
import { useUserFacts } from './_components/use-user-facts'

export default function AiSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMemoryEnabled = hasProAccess && (profile?.aiMemoryEnabled ?? false)
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)

  const aiMemoryMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAiMemory({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.aiMemoryEnabled
      patchProfile({ aiMemoryEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiMemoryEnabled: context.previous })
      }
    },
  })

  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAiSummary({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
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

  const showFactsPagination =
    facts.length > 0 && !selectMode && totalFactsPages > 1

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('aiSettings.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
        <AiFeatureToggles
          hasProAccess={hasProAccess}
          aiMemoryEnabled={aiMemoryEnabled}
          aiSummaryEnabled={aiSummaryEnabled}
          memoryPending={aiMemoryMutation.isPending}
          summaryPending={aiSummaryMutation.isPending}
          onToggleMemory={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
          onToggleSummary={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
        />

        <SectionLabel
          trailing={
            showFactsPagination ? (
              <FactsPagination
                page={factsPage}
                totalPages={totalFactsPages}
                onPrevious={() => setFactsPage((p) => p - 1)}
                onNext={() => setFactsPage((p) => p + 1)}
              />
            ) : undefined
          }
        >
          {t('profile.facts.title')}
        </SectionLabel>

        {!hasProAccess && (
          <div style={{ padding: '4px 20px 14px' }}>
            <ProUpgradeLink label={t('common.proBadge')} />
          </div>
        )}

        {hasProAccess && facts.length > 0 && (
          <FactsSelectBar
            factCount={facts.length}
            selectMode={selectMode}
            selectedCount={selectedFactIds.size}
            allSelected={selectedFactIds.size === facts.length}
            bulkDeletePending={bulkDeleteMutation.isPending}
            onToggleSelectAll={toggleSelectAll}
            onBulkDelete={() => bulkDeleteMutation.mutate([...selectedFactIds])}
            onToggleSelectMode={toggleSelectMode}
          />
        )}

        {hasProAccess && (
          <UserFactsList
            isLoading={factsQuery.isLoading}
            hasError={!!factsQuery.error}
            facts={facts}
            pagedFacts={pagedFacts}
            selectMode={selectMode}
            selectedFactIds={selectedFactIds}
            onToggleSelection={toggleFactSelection}
            onDelete={(id) => deleteMutation.mutate(id)}
            onRetry={() => factsQuery.refetch()}
            onAskAstra={() => router.push('/chat')}
          />
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
