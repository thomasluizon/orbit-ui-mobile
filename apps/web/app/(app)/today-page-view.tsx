'use client'

import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { getTodayBoundary } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { useIsClient } from '@/hooks/use-is-client'
import { HabitList } from '@/components/habits/habit-list'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
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
      <TodayDateControl {...view.nav.dateNav} />
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
          <BulkActionBarV2
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
