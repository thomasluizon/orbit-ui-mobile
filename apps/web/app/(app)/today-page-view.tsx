'use client'

import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { getTodayBoundary } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { useIsClient } from '@/hooks/use-is-client'
import { HabitList } from '@/components/habits/habit-list'
import { SelectionTray } from '@/components/habits/selection-tray'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { TodayDateControl } from './today-shell'
import type { TodayView } from './use-today-page'

function boundaryKey(boundary: ReturnType<typeof getTodayBoundary>): string | null {
  if (boundary === 'last-loggable') return 'habits.todayBoundary.lastLoggable'
  if (boundary === 'read-only') return 'habits.todayBoundary.readOnly'
  if (boundary === 'future') return 'habits.todayBoundary.future'
  return null
}

export function TodayHeaderRegion({ view }: Readonly<{ view: TodayView }>) {
  const t = useTranslations()
  const key = boundaryKey(getTodayBoundary(view.nav.dateStr, view.nav.today))

  return (
    <>
      <TodayDateControl
        {...view.nav.dateNav}
        moreLabel={t('habits.actions.more')}
        selectLabel={view.isSelectMode ? t('common.cancel') : t('common.select')}
        collapseLabel={view.habitListAllCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
        refreshLabel={t('habits.refresh')}
        completedLabel={view.showCompleted ? t('habits.hideCompleted') : t('habits.showCompleted')}
        isFetching={view.data.isFetching}
        onToggleSelect={view.toggleSelectMode}
        onToggleCollapse={() => {
          if (view.habitListAllCollapsed) view.habitListRef.current?.expandAll()
          else view.habitListRef.current?.collapseAll()
        }}
        onRefresh={() => void view.data.refetch()}
        onToggleCompleted={() => view.setShowCompleted(!view.showCompleted)}
      />
      {key ? (
        <div className="px-4 pb-4">
          <CapacityNotice message={t(key)} />
        </div>
      ) : null}
    </>
  )
}

export function TodayHabitsPanel({ view }: Readonly<{ view: TodayView }>) {
  const {
    data,
    habitListRef,
    isSelectMode,
    nav,
    selectedHabitIds,
    selection,
    setHabitListAllCollapsed,
    setShowCreateModal,
    showCompleted,
    toggleSelectMode,
  } = view

  return (
    <HabitList
      ref={habitListRef}
      view="today"
      selectedDate={nav.selectedDate}
      showCompleted={showCompleted}
      isSelectMode={isSelectMode}
      selectedHabitIds={selectedHabitIds}
      filters={data.filters}
      onToggleSelection={selection.handleToggleSelection}
      onEnterSelectMode={(habitId) => {
        if (!isSelectMode) toggleSelectMode()
        selection.handleToggleSelection(habitId)
      }}
      onCreate={() => setShowCreateModal(true)}
      onSeeUpcoming={nav.goToNextDay}
      onAllCollapsedChange={setHabitListAllCollapsed}
      onSurfaceOpenChange={view.setListSurfaceOpen}
    />
  )
}

export function TodayOverlays({ view }: Readonly<{ view: TodayView }>) {
  const t = useTranslations()
  const isClient = useIsClient()
  const count = view.selectedHabitIds.size

  return (
    <>
      <AnimatePresence initial={false}>
        {view.isSelectMode && isClient ? (
          <SelectionTray
            selectedCount={count}
            allSelected={view.selection.allSelected}
            onSelectAll={view.selection.selectAll}
            onDeselectAll={view.selection.deselectAll}
            onBulkLog={() => void view.selection.confirmBulkLog()}
            onBulkSkip={() => void view.selection.confirmBulkSkip()}
            onBulkDelete={() => view.selection.setShowBulkDeleteConfirm(true)}
            onCancel={view.toggleSelectMode}
          />
        ) : null}
      </AnimatePresence>
      <ConfirmSheet
        open={view.selection.showBulkDeleteConfirm}
        title={t('habits.bulkDeleteTitle')}
        message={plural(t('habits.bulkDeleteMessage', { count }), count)}
        confirmLabel={t('habits.bulkDeleteConfirm')}
        destructive
        onCancel={() => view.selection.setShowBulkDeleteConfirm(false)}
        onConfirm={() => {
          view.selection.setShowBulkDeleteConfirm(false)
          void view.selection.confirmBulkDelete()
        }}
      />
    </>
  )
}
