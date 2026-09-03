'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided motion components. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { getTodayBoundary } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { HabitList } from '@/components/habits/habit-list'
import { SelectionTray } from '@/components/habits/selection-tray'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { TrialBanner } from '@/components/ui/trial-banner'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { TodayDateControl } from './today-shell'
import { useShellComposerSlot } from '@/components/shell/destination-shell'
import type { TodayView } from './use-today-page'

function boundaryKey(boundary: ReturnType<typeof getTodayBoundary>): string | null {
  if (boundary === 'last-loggable') return 'habits.todayBoundary.lastLoggable'
  if (boundary === 'read-only') return 'habits.todayBoundary.readOnly'
  if (boundary === 'future') return 'habits.todayBoundary.future'
  return null
}

function useTodayPanelMotion(filterMotionKey: string, isRefetching: boolean) {
  const prefersReducedMotion = useReducedMotion()
  const preset = useMemo(
    () => resolveMotionPreset('list-enter', Boolean(prefersReducedMotion)),
    [prefersReducedMotion],
  )
  const dayOpacity = useMotionValue(1)
  const dayTranslate = useMotionValue(0)
  const refetchOpacity = useMotionValue(1)
  const refetchTranslate = useMotionValue(0)
  const previousFilterMotionKeyRef = useRef(filterMotionKey)
  const dayTransitionRunningRef = useRef(false)
  const dayTransitionSequenceRef = useRef(0)
  const dayAnimationsRef = useRef<ReturnType<typeof animate>[]>([])
  const refetchAnimationsRef = useRef<ReturnType<typeof animate>[]>([])

  useEffect(() => {
    if (filterMotionKey === previousFilterMotionKeyRef.current) return

    const direction = filterMotionKey > previousFilterMotionKeyRef.current ? 1 : -1
    previousFilterMotionKeyRef.current = filterMotionKey
    const shouldStartAtEdge = !dayTransitionRunningRef.current
    const sequence = dayTransitionSequenceRef.current + 1
    dayTransitionSequenceRef.current = sequence
    for (const animation of dayAnimationsRef.current) animation.stop()

    if (shouldStartAtEdge) {
      dayOpacity.set(0.9)
      dayTranslate.set(preset.reducedMotionEnabled ? 0 : direction * 8)
    } else if (preset.reducedMotionEnabled) {
      dayTranslate.set(0)
    }
    dayTransitionRunningRef.current = true
    const transition = {
      duration: preset.enterDuration / 1000,
      ease: preset.enterEasing,
    }
    dayAnimationsRef.current = [
      animate(dayOpacity, 1, {
        ...transition,
        onComplete: () => {
          if (dayTransitionSequenceRef.current === sequence) {
            dayTransitionRunningRef.current = false
          }
        },
      }),
      animate(dayTranslate, 0, transition),
    ]
  }, [
    dayOpacity,
    dayTranslate,
    filterMotionKey,
    preset.enterDuration,
    preset.enterEasing,
    preset.reducedMotionEnabled,
  ])

  useEffect(() => {
    for (const animation of refetchAnimationsRef.current) animation.stop()
    const entering = isRefetching
    const transition = {
      duration: (entering ? preset.enterDuration : preset.exitDuration) / 1000,
      ease: entering ? preset.enterEasing : preset.exitEasing,
    }
    refetchAnimationsRef.current = [
      animate(refetchOpacity, entering ? 0.8 : 1, transition),
      animate(
        refetchTranslate,
        entering && !preset.reducedMotionEnabled ? 4 : 0,
        transition,
      ),
    ]
    return () => {
      for (const animation of refetchAnimationsRef.current) animation.stop()
    }
  }, [
    isRefetching,
    preset.enterDuration,
    preset.enterEasing,
    preset.exitDuration,
    preset.exitEasing,
    preset.reducedMotionEnabled,
    refetchOpacity,
    refetchTranslate,
  ])

  return { dayOpacity, dayTranslate, refetchOpacity, refetchTranslate }
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
  const panelMotion = useTodayPanelMotion(nav.dateStr, data.isRefetching)

  return (
    <motion.div
      data-testid="today-refetch-motion"
      style={{ opacity: panelMotion.refetchOpacity, y: panelMotion.refetchTranslate }}
    >
      <motion.div
        data-testid="today-day-motion"
        style={{ opacity: panelMotion.dayOpacity, y: panelMotion.dayTranslate }}
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
