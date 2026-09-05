'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided motion components. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { getTodayBoundary } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { HabitList } from '@/components/habits/habit-list'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { TrialBanner } from '@/components/ui/trial-banner'
import { TodayDateControl } from './today-shell'
import { useShellComposerSlot } from '@/components/shell/destination-shell'
import type { TodayView } from './use-today-page'

const SelectionTray = dynamic(() =>
  import('@/components/habits/selection-tray').then((module) => module.SelectionTray),
)
const ConfirmSheet = dynamic(() =>
  import('@/components/ui/confirm-sheet').then((module) => module.ConfirmSheet),
)

function boundaryKey(boundary: ReturnType<typeof getTodayBoundary>): string | null {
  if (boundary === 'last-loggable') return 'habits.todayBoundary.lastLoggable'
  if (boundary === 'read-only') return 'habits.todayBoundary.readOnly'
  if (boundary === 'future') return 'habits.todayBoundary.future'
  return null
}

function useTodayRefetchMotion(isRefetching: boolean) {
  const prefersReducedMotion = useReducedMotion()
  const preset = useMemo(
    () => resolveMotionPreset('list-enter', Boolean(prefersReducedMotion)),
    [prefersReducedMotion],
  )
  const opacity = useMotionValue(1)
  const translate = useMotionValue(0)
  const animationsRef = useRef<ReturnType<typeof animate>[]>([])

  useEffect(() => {
    for (const animation of animationsRef.current) animation.stop()
    const entering = isRefetching
    const transition = {
      duration: (entering ? preset.enterDuration : preset.exitDuration) / 1000,
      ease: entering ? preset.enterEasing : preset.exitEasing,
    }
    animationsRef.current = [
      animate(opacity, entering ? 0.8 : 1, transition),
      animate(
        translate,
        entering && !preset.reducedMotionEnabled ? 4 : 0,
        transition,
      ),
    ]
    return () => {
      for (const animation of animationsRef.current) animation.stop()
    }
  }, [
    isRefetching,
    preset.enterDuration,
    preset.enterEasing,
    preset.exitDuration,
    preset.exitEasing,
    preset.reducedMotionEnabled,
    opacity,
    translate,
  ])

  return { opacity, translate }
}

export function TodayHeaderRegion({ view }: Readonly<{ view: TodayView }>) {
  const t = useTranslations()
  const key = boundaryKey(getTodayBoundary(view.nav.dateStr, view.nav.today))

  return (
    <div className="flex flex-col gap-6 pb-6">
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
      <TrialBanner />
      {key ? (
        <div className="px-4">
          <CapacityNotice message={t(key)} />
        </div>
      ) : null}
    </div>
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
  const refetchMotion = useTodayRefetchMotion(data.isRefetching)

  return (
    <motion.div
      data-testid="today-refetch-motion"
      style={{ opacity: refetchMotion.opacity, y: refetchMotion.translate }}
    >
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
        onSeeUpcoming={nav.dateNav.nextDisabled ? undefined : nav.goToNextDay}
        onAllCollapsedChange={setHabitListAllCollapsed}
        onSurfaceOpenChange={view.setListSurfaceOpen}
      />
    </motion.div>
  )
}

export function TodayOverlays({ view }: Readonly<{ view: TodayView }>) {
  const t = useTranslations()
  const pathname = usePathname()
  const count = view.selectedHabitIds.size

  useShellComposerSlot(
    pathname === '/' && view.isSelectMode,
    () => (
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
    ),
    `${Array.from(view.selectedHabitIds).sort().join(',')}:${view.selection.allSelected ? 'all' : 'some'}`,
  )

  return (
    <>
      {view.selection.showBulkDeleteConfirm ? (
        <ConfirmSheet
          open
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
      ) : null}
    </>
  )
}
