'use client'

// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion, type Transition } from 'motion/react'
import { useTranslations } from 'next-intl'
import type { EngagementSlotCard } from '@orbit/shared/utils'
import type { HabitsFilter } from '@orbit/shared/types/habit'
import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'
import { ReferralCard } from '@/components/referral/referral-card'
import { SocialEntryCard } from '@/components/social/social-entry-card'
import { SetupChecklistCard } from '@/components/today/setup-checklist-card'
import { SectionLabel } from '@/components/ui/section-label'
import { ProgressBar } from '@/components/ui/progress-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonHabitRow } from '@/components/ui/skeleton'
import { AlertTriangle } from '@/components/ui/icons'

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const

interface DayProgress {
  done: number
  total: number
}

interface TodayEngagementCardsProps {
  engagementSlot: EngagementSlotCard | null
  exitTransition: Transition
  onOpenReferral: () => void
  onDismissReferral: () => void
}

export function TodayEngagementCards({
  engagementSlot,
  exitTransition,
  onOpenReferral,
  onDismissReferral,
}: Readonly<TodayEngagementCardsProps>) {
  return (
    <div>
      <AnimatePresence initial={false}>
        {engagementSlot === 'referral' && (
          <motion.div
            key="engagement-referral"
            exit={{ opacity: 0, y: -4 }}
            transition={exitTransition}
          >
            <ReferralCard onOpen={onOpenReferral} onDismiss={onDismissReferral} />
          </motion.div>
        )}

        {engagementSlot === 'socialEntry' && (
          <motion.div
            key="engagement-social-entry"
            exit={{ opacity: 0, y: -4 }}
            transition={exitTransition}
          >
            <SocialEntryCard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface TodayHabitsProgressHeaderProps {
  showDayProgress: boolean
  dayProgress: DayProgress
  engagementSlot: EngagementSlotCard | null
  exitTransition: Transition
}

export function TodayHabitsProgressHeader({
  showDayProgress,
  dayProgress,
  engagementSlot,
  exitTransition,
}: Readonly<TodayHabitsProgressHeaderProps>) {
  const t = useTranslations()
  return (
    <>
      <div className="md:hidden">
        <SectionLabel
          top={20}
          bottom={showDayProgress ? 8 : 0}
          trailing={
            showDayProgress ? (
              <span className="t-meta">
                {dayProgress.done}/{dayProgress.total}
              </span>
            ) : undefined
          }
        >
          {t('habits.sectionLabel')}
        </SectionLabel>
      </div>

      {showDayProgress && (
        <div className="md:hidden" style={{ padding: '0 20px 8px' }}>
          <ProgressBar
            progress={dayProgress.done / dayProgress.total}
            label={`${dayProgress.done}/${dayProgress.total} ${t('habits.completed')}`}
          />
        </div>
      )}

      <div>
        <AnimatePresence initial={false}>
          {engagementSlot === 'setupChecklist' && (
            <motion.div
              key="engagement-setup-checklist"
              exit={{ opacity: 0, y: -4 }}
              transition={exitTransition}
            >
              <SetupChecklistCard />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

interface TodayHabitsStatesProps {
  showLoadError: boolean
  onRetry: () => void
  hasFetched: boolean
  isRefetching: boolean
  listTransition: Transition
}

export function TodayHabitsStates({
  showLoadError,
  onRetry,
  hasFetched,
  isRefetching,
  listTransition,
}: Readonly<TodayHabitsStatesProps>) {
  const t = useTranslations()
  return (
    <>
      {showLoadError && (
        <EmptyState
          icon={AlertTriangle}
          description={t('habits.loadError')}
          action={{
            label: t('common.retry'),
            onClick: onRetry,
            variant: 'secondary',
          }}
        />
      )}

      {!hasFetched && !showLoadError && (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="stagger-enter flex flex-col gap-3 px-5 pt-3 pb-2"
        >
          {SKELETON_KEYS.map((key) => (
            <SkeletonHabitRow key={key} />
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isRefetching ? (
          <motion.div
            key="today-refetch-indicator"
            className="overflow-hidden px-5 pt-1 origin-top"
            style={{ height: 8 }}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            transition={listTransition}
          >
            <motion.div
              data-testid="today-refetch-indicator"
              className="loading-bar h-1 w-full rounded-full origin-center"
              initial={{ opacity: 0.7, scaleX: 0.92 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0.96 }}
              transition={listTransition}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

interface TodayHabitsListShellProps {
  hasFetched: boolean
  isRefetching: boolean
  refetchShift: number
  listTransition: Transition
  isSelectMode: boolean
  habitListRef: React.RefObject<HabitListHandle | null>
  view: string
  selectedDate: Date
  showCompleted: boolean
  selectedHabitIds: Set<string>
  searchQuery: string
  filters: HabitsFilter
  onToggleSelection: (habitId: string) => void
  onToggleSelectMode: () => void
  onCreate: () => void
  onSeeUpcoming: () => void
  onAllCollapsedChange: (allCollapsed: boolean) => void
}

// react-doctor-disable-next-line no-many-boolean-props -- private single-use Today list shell; the flags are independent render inputs (fetch/refetch/select/show-completed), not a combinatorial API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function TodayHabitsListShell({
  hasFetched,
  isRefetching,
  refetchShift,
  listTransition,
  isSelectMode,
  habitListRef,
  view,
  selectedDate,
  showCompleted,
  selectedHabitIds,
  searchQuery,
  filters,
  onToggleSelection,
  onToggleSelectMode,
  onCreate,
  onSeeUpcoming,
  onAllCollapsedChange,
}: Readonly<TodayHabitsListShellProps>) {
  if (!hasFetched) return null
  return (
    <motion.div
      layout
      data-testid="today-list-shell"
      className={`overflow-x-hidden overflow-y-visible ${
        isSelectMode ? 'pb-48 md:pb-32' : ''
      }`}
      animate={{
        opacity: isRefetching ? 0.78 : 1,
        y: isRefetching ? refetchShift : 0,
        scale: isRefetching ? 0.995 : 1,
      }}
      transition={listTransition}
    >
      <HabitList
        ref={habitListRef}
        view={view === 'today' || view === 'all' || view === 'general' ? view : 'today'}
        selectedDate={selectedDate}
        showCompleted={showCompleted}
        isSelectMode={isSelectMode}
        selectedHabitIds={selectedHabitIds}
        searchQuery={searchQuery}
        filters={filters}
        onToggleSelection={onToggleSelection}
        onEnterSelectMode={(habitId) => {
          if (!isSelectMode) onToggleSelectMode()
          onToggleSelection(habitId)
        }}
        onCreate={onCreate}
        onSeeUpcoming={onSeeUpcoming}
        onAllCollapsedChange={onAllCollapsedChange}
      />
    </motion.div>
  )
}
