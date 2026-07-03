'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys } from '@orbit/shared/query'
import { useProfile } from '@/hooks/use-profile'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { updateAiMemory, updateAiSummary, updateProactiveAstra } from '@/app/actions/profile'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AiFeatureToggles } from './_components/ai-feature-toggles'
import { ProUpgradeLink } from './_components/pro-upgrade-link'
import { FactsSelectBar } from './_components/facts-select-bar'
import { UserFactsList } from './_components/user-facts-list'
import { useUserFacts } from './_components/use-user-facts'

export default function AiSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMemoryEnabled = hasProAccess && (profile?.aiMemoryEnabled ?? false)
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)
  const proactiveAstraEnabled = hasProAccess && (profile?.proactiveAstraEnabled ?? false)

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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })

  const proactiveAstraMutation = useMutation({
    mutationFn: (enabled: boolean) => updateProactiveAstra({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.proactiveAstraEnabled
      patchProfile({ proactiveAstraEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ proactiveAstraEnabled: context.previous })
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

  const showFactsPagination = totalFactsPages > 1
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('aiSettings.title')}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="stagger-enter">
            <AiFeatureToggles
              hasProAccess={hasProAccess}
              aiMemoryEnabled={aiMemoryEnabled}
              aiSummaryEnabled={aiSummaryEnabled}
              proactiveAstraEnabled={proactiveAstraEnabled}
              memoryPending={aiMemoryMutation.isPending}
              summaryPending={aiSummaryMutation.isPending}
              proactivePending={proactiveAstraMutation.isPending}
              onToggleMemory={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
              onToggleSummary={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              onToggleProactive={() => proactiveAstraMutation.mutate(!proactiveAstraEnabled)}
              onUpgrade={() => router.push('/upgrade')}
            />
          </div>

          <div className="stagger-enter">
            <SectionLabel
              trailing={
                hasProAccess && facts.length > 0 ? (
                  <FactsSelectBar
                    selectMode={selectMode}
                    selectedCount={selectedFactIds.size}
                    allSelected={selectedFactIds.size === facts.length}
                    bulkDeletePending={bulkDeleteMutation.isPending}
                    showPagination={showFactsPagination}
                    page={factsPage}
                    totalPages={totalFactsPages}
                    onPreviousPage={() => setFactsPage((p) => p - 1)}
                    onNextPage={() => setFactsPage((p) => p + 1)}
                    onToggleSelectAll={toggleSelectAll}
                    onBulkDelete={() => setConfirmBulkDelete(true)}
                    onToggleSelectMode={toggleSelectMode}
                  />
                ) : undefined
              }
            >
              {t('profile.facts.title')}
            </SectionLabel>

            {!hasProAccess && (
              <div
                className="flex flex-col"
                style={{ padding: '4px 20px 14px', gap: 10 }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--fg-3)',
                  }}
                >
                  {t('profile.facts.lockedHint')}
                </p>
                <div>
                  <ProUpgradeLink label={t('common.proBadge')} />
                </div>
              </div>
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
      </div>

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={t('profile.facts.bulkDeleteConfirmTitle')}
        description={t('profile.facts.bulkDeleteConfirmBody')}
        confirmLabel={t('profile.facts.deleteSelected', { n: selectedFactIds.size })}
        variant="danger"
        onConfirm={() => bulkDeleteMutation.mutate([...selectedFactIds])}
      />
    </div>
  )
}
