'use client'

import { useCallback } from 'react'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { plural } from '@/lib/plural'
import { useIsClient } from '@/hooks/use-is-client'
import { GradientTop } from '@/components/ui/gradient-top'
import { TodayAISummary } from '@/components/habits/today-ai-summary'
import { GoalsView } from '@/components/goals/goals-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { TodayHeader, TodayTabs, TodayDateNavigation, TodayUtilityRow } from './today-shell'
import {
  TodayEngagementCards,
  TodayHabitsProgressHeader,
  TodayHabitsStates,
  TodayHabitsListShell,
} from './today-sections'
import type { TodayView } from './use-today-page'

export function TodayHeaderRegion({ view }: Readonly<{ view: TodayView }>) {
  const { nav, currentActiveView } = view
  const showAISummary = currentActiveView === 'today' && nav.isTodaySelected

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -z-10 md:hidden"
        style={{
          left: 'calc(var(--app-px) * -1)',
          right: 'calc(var(--app-px) * -1)',
        }}
      >
        <GradientTop height={260} />
      </div>

      <div className="md:hidden">
        <TodayHeader streak={view.streak} />

        <TodayTabs
          tabs={view.tabItems}
          activeView={currentActiveView}
          hasProAccess={view.hasProAccess}
          onChangeView={view.attemptViewChange}
          viewsLabel={view.viewsLabel}
        />
      </div>

      <div className="pt-1.5 md:pt-2.5">
        {showAISummary && <TodayAISummary date={nav.dateStr} />}

        <TodayEngagementCards
          engagementSlot={view.engagementSlot}
          exitTransition={view.engagementExitTransition}
          onOpenReferral={() => view.setShowReferral(true)}
          onDismissReferral={view.dismissHomeEntry}
        />
      </div>

      <div className="md:hidden">
        <TodayDateNavigation visible={currentActiveView === 'today'} {...nav.dateNav} />
      </div>
    </>
  )
}

export function TodayGoalsPanel({ view }: Readonly<{ view: TodayView }>) {
  return (
    <div id="tabpanel-goals" role="tabpanel" aria-labelledby="tab-goals">
      {view.currentActiveView === 'goals' && <GoalsView />}
    </div>
  )
}

export function TodayHabitsPanel({ view }: Readonly<{ view: TodayView }>) {
  const { data, search, selection, nav, currentActiveView, habitListRef, habitListAllCollapsed } = view
  const queryClient = useQueryClient()

  const handleToggleCollapse = useCallback(() => {
    if (habitListAllCollapsed) {
      habitListRef.current?.expandAll()
    } else {
      habitListRef.current?.collapseAll()
    }
  }, [habitListAllCollapsed, habitListRef])

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }, [queryClient])

  return (
    <div id="tabpanel-habits" role="tabpanel" aria-labelledby={`tab-${currentActiveView}`}>
      <TodayHabitsProgressHeader
        showDayProgress={data.showDayProgress}
        dayProgress={data.dayProgress}
        engagementSlot={view.engagementSlot}
        exitTransition={view.engagementExitTransition}
      />

      <motion.div layout transition={view.listTransition} data-testid="today-utility-row">
        <TodayUtilityRow
          activeView={currentActiveView}
          searchOpen={search.searchOpen}
          searchValue={search.localSearchQuery}
          selectedFrequency={data.selectedFrequency}
          selectedTagIds={data.selectedTagIds}
          tags={view.tags}
          frequencyOptions={data.frequencyOptions}
          isSelectMode={view.isSelectMode}
          showCompleted={view.showCompleted}
          isFetching={data.isFetching}
          allCollapsed={habitListAllCollapsed}
          onSearchToggle={search.toggleSearch}
          onSearchChange={search.setLocalSearchQuery}
          onSearchClear={() => search.setLocalSearchQuery('')}
          onFrequencyChange={data.setSelectedFrequency}
          onTagToggle={data.toggleTagFilter}
          onToggleSelect={view.toggleSelectMode}
          onToggleCollapse={handleToggleCollapse}
          onRefresh={handleRefresh}
          onToggleCompleted={() => view.setShowCompleted(!view.showCompleted)}
        />
      </motion.div>

      <TodayHabitsStates
        showLoadError={data.showLoadError}
        onRetry={data.refetch}
        hasFetched={data.hasFetched}
        isRefetching={data.isRefetching}
        listTransition={view.listTransition}
      />

      <TodayHabitsListShell
        hasFetched={data.hasFetched}
        isRefetching={data.isRefetching}
        refetchShift={view.refetchShift}
        listTransition={view.listTransition}
        isSelectMode={view.isSelectMode}
        habitListRef={habitListRef}
        view={currentActiveView}
        selectedDate={nav.selectedDate}
        showCompleted={view.showCompleted}
        selectedHabitIds={view.selectedHabitIds}
        searchQuery={view.searchQueryStore}
        filters={data.filters}
        onToggleSelection={selection.handleToggleSelection}
        onToggleSelectMode={view.toggleSelectMode}
        onCreate={() => view.setShowCreateModal(true)}
        onSeeUpcoming={nav.goToNextDay}
        onAllCollapsedChange={view.setHabitListAllCollapsed}
      />
    </div>
  )
}

export function TodayOverlays({ view }: Readonly<{ view: TodayView }>) {
  const t = useTranslations()
  const isClient = useIsClient()
  const { selection } = view
  const count = view.selectedHabitIds.size

  return (
    <>
      <AnimatePresence initial={false}>
        {view.isSelectMode && isClient ? (
          <BulkActionBarV2
            selectedCount={count}
            allSelected={selection.allSelected}
            onSelectAll={selection.selectAll}
            onDeselectAll={selection.deselectAll}
            onBulkLog={() => selection.setShowBulkLogConfirm(true)}
            onBulkSkip={() => selection.setShowBulkSkipConfirm(true)}
            onBulkDelete={() => selection.setShowBulkDeleteConfirm(true)}
            onCancel={view.toggleSelectMode}
          />
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={selection.showBulkDeleteConfirm}
        onOpenChange={selection.setShowBulkDeleteConfirm}
        title={t('habits.bulkDeleteTitle')}
        description={plural(t('habits.bulkDeleteMessage', { count }), count)}
        confirmLabel={t('habits.bulkDeleteConfirm')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => void selection.confirmBulkDelete()}
        onCancel={() => selection.setShowBulkDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={selection.showBulkLogConfirm}
        onOpenChange={selection.setShowBulkLogConfirm}
        title={t('habits.bulkLogTitle')}
        description={plural(t('habits.bulkLogMessage', { count }), count)}
        confirmLabel={t('habits.bulkLogConfirm')}
        cancelLabel={t('common.cancel')}
        variant="success"
        onConfirm={() => void selection.confirmBulkLog()}
        onCancel={() => selection.setShowBulkLogConfirm(false)}
      />

      <ConfirmDialog
        open={selection.showBulkSkipConfirm}
        onOpenChange={selection.setShowBulkSkipConfirm}
        title={t('habits.bulkSkipTitle')}
        description={plural(t('habits.bulkSkipMessage', { count }), count)}
        confirmLabel={t('habits.bulkSkipConfirm')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={() => void selection.confirmBulkSkip()}
        onCancel={() => selection.setShowBulkSkipConfirm(false)}
      />

      <ReferralDrawer open={view.showReferral} onOpenChange={view.setShowReferral} />
    </>
  )
}
