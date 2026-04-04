'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  isToday as isDateToday,
  isTomorrow,
  isYesterday,
  format,
  isBefore,
  startOfDay,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  Home,
  Plus,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { HabitCard } from './habit-card'
import { HabitDetailDrawer } from './habit-detail-drawer'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import { LogHabitModal } from './log-habit-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useReorderHabits,
  type NormalizedHabitsData,
} from '@/hooks/use-habits'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { useUIStore } from '@/stores/ui-store'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitListProps {
  view?: 'today' | 'all' | 'general'
  selectedDate?: Date
  showCompleted?: boolean
  isSelectMode?: boolean
  selectedHabitIds?: Set<string>
  searchQuery?: string
  filters: HabitsFilter
  onToggleSelection?: (habitId: string) => void
  onEnterSelectMode?: (habitId: string) => void
  onCreate?: () => void
  onSeeUpcoming?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitList({
  view = 'today',
  selectedDate,
  showCompleted = false,
  isSelectMode = false,
  selectedHabitIds,
  searchQuery = '',
  filters,
  onToggleSelection,
  onEnterSelectMode,
  onCreate,
  onSeeUpcoming,
}: HabitListProps) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  // Queries & mutations
  const habitsQuery = useHabits(filters)
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const deleteHabitMut = useDeleteHabit()
  const duplicateHabitMut = useDuplicateHabit()
  const reorderHabitsMut = useReorderHabits()

  const data = habitsQuery.data
  const habitsById = data?.habitsById ?? new Map()
  const childrenByParent = data?.childrenByParent ?? new Map()
  const topLevelHabits = data?.topLevelHabits ?? []

  // Get children helper
  const getChildren = habitsQuery.getChildren

  // UI store
  const lastCreatedHabitId = useUIStore((s) => s.lastCreatedHabitId)

  // Recently completed for exit animation
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState(
    new Set<string>(),
  )

  const markRecentlyCompleted = useCallback((habitId: string) => {
    setRecentlyCompletedIds((prev) => new Set(prev).add(habitId))
    setTimeout(() => {
      setRecentlyCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(habitId)
        return next
      })
    }, 1400)
  }, [])

  // Visibility helpers
  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : formatAPIDate(new Date())
  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
  })

  // Drill navigation
  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt)

  // Collapse state
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())

  const toggleExpand = useCallback((habitId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(habitId)) {
        next.delete(habitId)
      } else {
        next.add(habitId)
      }
      return next
    })
  }, [])

  // Filter habits
  const habits = useMemo(() => {
    if (view === 'general' || view === 'all') {
      return showCompleted
        ? topLevelHabits
        : topLevelHabits.filter(
            (h) => !h.isCompleted || recentlyCompletedIds.has(h.id),
          )
    }
    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter((h) => visibility.hasVisibleContent(h))
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  // Children progress
  const getChildrenProgress = useCallback(
    (habitId: string) => {
      const children = getChildren(habitId)
      let done = 0
      let total = 0
      for (const child of children) {
        total++
        if (child.isCompleted || child.isLoggedInRange) done++
        // Recurse
        const nested = getChildren(child.id)
        for (const nc of nested) {
          total++
          if (nc.isCompleted || nc.isLoggedInRange) done++
        }
      }
      return { done, total }
    },
    [getChildren],
  )

  // Date groups for "all" view
  interface DateGroup {
    key: string
    label: string
    isOverdue: boolean
    habits: NormalizedHabit[]
  }

  const dateGroups = useMemo<DateGroup[]>(() => {
    if (view !== 'all') return []

    const today = formatAPIDate(new Date())
    const overdueHabits: NormalizedHabit[] = []
    const groups = new Map<string, NormalizedHabit[]>()

    for (const habit of habits) {
      const key = habit.dueDate ?? ''
      if (!key) {
        if (!groups.has('')) groups.set('', [])
        groups.get('')!.push(habit)
      } else if (key < today && !habit.isCompleted) {
        overdueHabits.push(habit)
      } else {
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(habit)
      }
    }

    const result: DateGroup[] = []

    if (overdueHabits.length > 0) {
      result.push({
        key: '__overdue__',
        label: t('habits.overdue'),
        isOverdue: true,
        habits: overdueHabits.sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        ),
      })
    }

    const sorted = Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    for (const [key, groupHabits] of sorted) {
      let label: string
      if (!key) {
        label = t('common.unknown')
      } else {
        const date = new Date(key + 'T00:00:00')
        const todayDate = startOfDay(new Date())
        if (isDateToday(date)) label = t('dates.today')
        else if (isTomorrow(date)) label = t('dates.tomorrow')
        else if (isYesterday(date)) label = t('dates.yesterday')
        else if (isBefore(date, todayDate))
          label = format(date, locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM dd, yyyy', {
            locale: dateFnsLocale,
          })
        else
          label = format(
            date,
            locale === 'pt-BR' ? "EEEE, dd 'de' MMM" : 'EEEE, MMM dd',
            { locale: dateFnsLocale },
          )
      }
      result.push({
        key,
        label,
        isOverdue: false,
        habits: groupHabits,
      })
    }

    return result
  }, [view, habits, t, locale, dateFnsLocale])

  // Flat drag items for rendering
  interface DragItem {
    id: string
    habit: NormalizedHabit
    depth: number
    hasChildren: boolean
    hasSubHabits: boolean
  }

  const dragItems = useMemo<DragItem[]>(() => {
    if (view === 'all') return [] // all view uses date groups

    const items: DragItem[] = []

    function addHabitTree(habit: NormalizedHabit, depth: number) {
      const visibleChildren = visibility.getVisibleChildren(habit.id, view)
      items.push({
        id: habit.id,
        habit,
        depth,
        hasChildren: visibleChildren.length > 0,
        hasSubHabits: habit.hasSubHabits,
      })
      if (!collapsedIds.has(habit.id)) {
        for (const child of visibleChildren) {
          addHabitTree(child, depth + 1)
        }
      }
    }

    for (const h of habits) {
      addHabitTree(h, 0)
    }

    return items
  }, [habits, collapsedIds, visibility, view])

  // Card selected date (only pass in today view to dim non-due)
  const cardSelectedDate = view === 'today' ? (selectedDate ?? new Date()) : undefined

  // Modal states
  const [showDetailDrawer, setShowDetailDrawer] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState<NormalizedHabit | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [habitToEdit, setHabitToEdit] = useState<NormalizedHabit | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] = useState<NormalizedHabit | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [habitToLog, setHabitToLog] = useState<NormalizedHabit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [habitToSkip, setHabitToSkip] = useState<string | null>(null)
  const [showForceLogConfirm, setShowForceLogConfirm] = useState(false)
  const [forceLogHabitId, setForceLogHabitId] = useState<string | null>(null)

  // Actions
  function openDetail(habit: NormalizedHabit) {
    setSelectedHabit(habit)
    setShowDetailDrawer(true)
  }

  function promptLog(habit: NormalizedHabit) {
    setHabitToLog(habit)
    setShowLogModal(true)
  }

  function promptDelete(habitId: string) {
    setHabitToDelete(habitId)
    setShowDeleteConfirm(true)
  }

  function promptSkip(habitId: string) {
    setHabitToSkip(habitId)
    setShowSkipConfirm(true)
  }

  function startAddSubHabit(parentId: string) {
    const parent = habitsById.get(parentId)
    if (!parent) return
    if (collapsedIds.has(parentId)) toggleExpand(parentId)
    setSubHabitParent(parent)
    setShowSubHabitModal(true)
  }

  async function confirmDelete() {
    if (!habitToDelete) return
    try {
      await deleteHabitMut.mutateAsync(habitToDelete)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToDelete(null)
      setShowDeleteConfirm(false)
    }
  }

  async function confirmSkip() {
    if (!habitToSkip) return
    try {
      await skipHabit.mutateAsync({ habitId: habitToSkip })
      markRecentlyCompleted(habitToSkip)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToSkip(null)
      setShowSkipConfirm(false)
    }
  }

  function handleLogged(habitId: string) {
    markRecentlyCompleted(habitId)
  }

  async function confirmForceLog() {
    if (!forceLogHabitId) return
    markRecentlyCompleted(forceLogHabitId)
    try {
      await logHabit.mutateAsync({ habitId: forceLogHabitId })
    } catch {
      // Error handled by mutation
    } finally {
      setForceLogHabitId(null)
      setShowForceLogConfirm(false)
    }
  }

  function handleDetailDelete(habitId: string) {
    setShowDetailDrawer(false)
    setSelectedHabit(null)
    promptDelete(habitId)
  }

  function handleDetailEdit(habitId: string) {
    const habit = selectedHabit ?? habitsById.get(habitId)
    if (!habit) return
    setShowDetailDrawer(false)
    setSelectedHabit(null)
    setHabitToEdit(habit)
    setShowEditModal(true)
  }

  const isPostponeAction = useMemo(() => {
    if (!habitToSkip) return false
    const habit = habitsById.get(habitToSkip)
    return habit ? !habit.frequencyUnit : false
  }, [habitToSkip, habitsById])

  // Render a single HabitCard with all handlers
  function renderHabitCard(
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
  ) {
    const progress = hasChildren ? getChildrenProgress(habit.id) : { done: 0, total: 0 }

    return (
      <HabitCard
        key={habit.id}
        habit={habit}
        selectedDate={cardSelectedDate}
        searchQuery={searchQuery}
        isJustCreated={lastCreatedHabitId === habit.id}
        depth={depth}
        hasChildren={hasChildren}
        hasSubHabits={hasSubHabits}
        isExpanded={!collapsedIds.has(habit.id)}
        childrenDone={progress.done}
        childrenTotal={progress.total}
        isSelectMode={isSelectMode}
        isSelected={selectedHabitIds?.has(habit.id) ?? false}
        onLog={() => promptLog(habit)}
        onUnlog={() => logHabit.mutate({ habitId: habit.id })}
        onForceLogParent={() => {
          setForceLogHabitId(habit.id)
          setShowForceLogConfirm(true)
        }}
        onSkip={() => promptSkip(habit.id)}
        onDuplicate={() => duplicateHabitMut.mutate(habit.id)}
        onMoveParent={() => {
          // TODO: Move parent picker
        }}
        onDelete={() => promptDelete(habit.id)}
        onDetail={() => openDetail(habit)}
        onDrillInto={() => drill.drillInto(habit.id)}
        onAddSubHabit={() => startAddSubHabit(habit.id)}
        showAddSubHabit
        onToggleExpand={() => toggleExpand(habit.id)}
        onToggleSelection={() => onToggleSelection?.(habit.id)}
        onEnterSelectMode={() => onEnterSelectMode?.(habit.id)}
      />
    )
  }

  // Loading skeleton
  if (habitsQuery.isLoading && !habitsQuery.data) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="habit-card-parent rounded-2xl p-4 sm:p-5 flex items-center gap-4"
          >
            <div className="size-10 sm:size-11 rounded-full bg-surface-elevated animate-pulse" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-3/4 bg-surface-elevated rounded-lg animate-pulse" />
              <div className="h-3 w-2/5 bg-surface-elevated/60 rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {/* Drill-down view */}
      {drill.currentParent ? (
        <>
          <div className="flex items-center gap-3 pb-1">
            <button
              aria-label={t('common.goBack')}
              className="shrink-0 size-8 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated/80 transition-all duration-150"
              onClick={drill.drillBack}
            >
              <ArrowLeft className="size-4 text-text-secondary" aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-text-primary truncate">
                {drill.currentParent.title}
              </h3>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                {drill.drillChildren.filter((c) => c.isCompleted).length}/
                {drill.drillChildren.length} {t('habits.completed')}
              </p>
            </div>
          </div>

          {drill.drillStack.length > 1 && (
            <button
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pb-2"
              onClick={drill.drillReset}
            >
              <Home className="size-3" />
              {t('habits.backToHabits')}
            </button>
          )}

          {drill.drillLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="habit-card-parent rounded-2xl p-4 sm:p-5 flex items-center gap-4"
                >
                  <div className="size-10 sm:size-11 rounded-full bg-surface-elevated animate-pulse" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 w-3/4 bg-surface-elevated rounded-lg animate-pulse" />
                    <div className="h-3 w-2/5 bg-surface-elevated/60 rounded-lg animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : drill.drillChildren.length > 0 ? (
            <div className="space-y-2.5 pt-2">
              {drill.drillChildren.map((child) =>
                renderHabitCard(
                  child,
                  0,
                  drill.getDrillChildren(child.id).length > 0,
                  child.hasSubHabits || drill.getDrillChildren(child.id).length > 0,
                ),
              )}
              <button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border-muted text-text-muted text-sm hover:border-primary hover:text-primary transition-all duration-150"
                onClick={() => drill.currentParentId && startAddSubHabit(drill.currentParentId)}
              >
                <Plus className="size-4" />
                {t('habits.form.addSubHabit')}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-text-muted text-sm">
                {t('habits.noSubHabits')}
              </p>
              <button
                className="mt-4 flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl border border-dashed border-border-muted text-text-muted text-sm hover:border-primary hover:text-primary transition-all duration-150"
                onClick={() => drill.currentParentId && startAddSubHabit(drill.currentParentId)}
              >
                <Plus className="size-4" />
                {t('habits.form.addSubHabit')}
              </button>
            </div>
          )}
        </>
      ) : habits.length === 0 && view === 'today' && (data?.totalCount ?? 0) > 0 ? (
        /* Empty: all done today */
        <div className="text-center py-16">
          <div className="bg-success/10 rounded-full size-20 flex items-center justify-center mx-auto mb-4 border border-success/20">
            <CheckCircle2 className="size-10 text-success" />
          </div>
          <p className="text-text-primary font-bold text-lg mb-1">
            {t('habits.allDoneToday')}
          </p>
          <p className="text-text-secondary text-sm mb-6">
            {t('habits.allDoneHint')}
          </p>
          <button
            className="px-6 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-sm hover:bg-primary/15 transition-all active:scale-95"
            onClick={onSeeUpcoming}
          >
            {t('habits.seeUpcoming')}
          </button>
        </div>
      ) : habits.length === 0 ? (
        /* Empty: no habits */
        <div className="text-center py-16">
          <div className="bg-surface-ground rounded-full size-20 flex items-center justify-center mx-auto mb-4 border border-border-muted">
            <ClipboardList className="size-10 text-text-muted" />
          </div>
          <p className="text-text-secondary mb-6">
            {view === 'general'
              ? t('habits.emptyGeneral')
              : view === 'today'
                ? t('habits.noDueToday')
                : t('habits.noHabitsYet')}
          </p>
          {(view === 'all' || view === 'general') && (
            <button
              className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-[var(--shadow-glow)] active:scale-95 transition-transform"
              onClick={onCreate}
            >
              {t('habits.createHabit')}
            </button>
          )}
        </div>
      ) : view === 'all' ? (
        /* ALL VIEW: date-grouped list */
        <>
          {dateGroups.map((group) => (
            <div key={group.key} className="mb-4">
              <div className="flex items-center gap-3 mb-2 mt-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                    group.isOverdue ? 'text-red-400' : 'text-text-muted'
                  }`}
                >
                  {group.isOverdue ? t('habits.overdue') : group.label}
                </span>
                <div
                  className={`flex-1 h-px ${
                    group.isOverdue ? 'bg-red-500/20' : 'bg-border'
                  }`}
                />
              </div>
              <div className="space-y-2.5">
                {group.habits.map((habit) =>
                  renderHabitCard(
                    habit,
                    0,
                    getChildren(habit.id).length > 0,
                    habit.hasSubHabits,
                  ),
                )}
              </div>
            </div>
          ))}
        </>
      ) : (
        /* TODAY / GENERAL VIEW: flat list */
        <>
          {dragItems.map((item) =>
            renderHabitCard(
              item.habit,
              item.depth,
              item.hasChildren,
              item.hasSubHabits,
            ),
          )}
        </>
      )}

      {/* Modals */}
      <HabitDetailDrawer
        open={showDetailDrawer}
        onOpenChange={setShowDetailDrawer}
        habit={selectedHabit}
        onDelete={handleDetailDelete}
        onEdit={handleDetailEdit}
        onLogged={handleLogged}
      />

      <EditHabitModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        habit={habitToEdit}
      />

      {showSubHabitModal && (
        <CreateHabitModal
          open={showSubHabitModal}
          onOpenChange={setShowSubHabitModal}
          parentHabit={subHabitParent}
        />
      )}

      <LogHabitModal
        open={showLogModal}
        onOpenChange={setShowLogModal}
        habit={habitToLog}
        onLogged={handleLogged}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('habits.deleteConfirmTitle')}
        description={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
        variant="danger"
      />

      <ConfirmDialog
        open={showSkipConfirm}
        onOpenChange={setShowSkipConfirm}
        title={t(
          isPostponeAction
            ? 'habits.postponeConfirmTitle'
            : 'habits.skipConfirmTitle',
        )}
        description={t(
          isPostponeAction
            ? 'habits.postponeConfirmMessage'
            : 'habits.skipConfirmMessage',
        )}
        confirmLabel={t(
          isPostponeAction
            ? 'habits.postponeConfirmButton'
            : 'habits.skipConfirmButton',
        )}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmSkip}
        onCancel={() => {
          setHabitToSkip(null)
          setShowSkipConfirm(false)
        }}
        variant="warning"
      />

      <ConfirmDialog
        open={showForceLogConfirm}
        onOpenChange={setShowForceLogConfirm}
        title={t('habits.forceLogTitle')}
        description={t('habits.forceLogMessage')}
        confirmLabel={t('habits.logHabit')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmForceLog}
        onCancel={() => {
          setForceLogHabitId(null)
          setShowForceLogConfirm(false)
        }}
        variant="warning"
      />
    </div>
  )
}
