'use client'

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
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { PillButton } from '@/components/ui/pill-button'

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
          bottom={showDayProgress ? 6 : 0}
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
        <div className="md:hidden" style={{ padding: '0 20px 6px' }}>
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
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <SatelliteGlyph />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
              lineHeight: 1.5,
              maxWidth: 280,
              marginTop: 14,
            }}
          >
            {t('habits.loadError')}
          </p>
          <PillButton variant="ghost" className="mt-[22px]" onClick={onRetry}>
            {t('common.retry')}
          </PillButton>
        </div>
      )}

      {!hasFetched && !showLoadError && (
        <div className="stagger-enter" style={{ padding: '12px 20px 8px' }}>
          {SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center skeleton-pulse"
              style={{
                padding: '14px 16px',
                gap: 14,
                borderRadius: 18,
                background: 'var(--bg-card)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
                marginBottom: 10,
              }}
            >
              <div
                className="shrink-0"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                }}
              />
              <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
                <div
                  style={{
                    width: '55%',
                    height: 12,
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                  }}
                />
                <div
                  style={{
                    width: '32%',
                    height: 12,
                    borderRadius: 6,
                    background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                  }}
                />
              </div>
              <div
                className="rounded-full shrink-0"
                style={{
                  width: 30,
                  height: 30,
                  background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                }}
              />
            </div>
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
