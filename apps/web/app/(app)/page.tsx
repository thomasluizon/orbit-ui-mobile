'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  addDays,
  subDays,
  isToday,
  isYesterday,
  isTomorrow,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
  Settings2,
  Eye,
  EyeOff,
  ChevronsDownUp,
  ChevronsUpDown,
  CheckSquare,
  Trash2,
  Check,
  FastForward,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { HabitList } from '@/components/habits/habit-list'
import { HabitSummaryCard } from '@/components/habits/habit-summary-card'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { GoalsView } from '@/components/goals/goals-view'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitsFilter } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
type ViewTab = (typeof TAB_VIEWS)[number]

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TodayPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()

  // UI Store
  const selectedDateStr = useUIStore((s) => s.selectedDate)
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleHabitSelection = useUIStore((s) => s.toggleHabitSelection)
  const clearSelection = useUIStore((s) => s.clearSelection)

  // Local state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    [selectedDateStr],
  )

  // Date navigation
  const goToPreviousDay = useCallback(() => {
    setSelectedDate(formatAPIDate(subDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToNextDay = useCallback(() => {
    setSelectedDate(formatAPIDate(addDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToToday = useCallback(() => {
    setSelectedDate(formatAPIDate(new Date()))
    setActiveView('today')
  }, [setSelectedDate, setActiveView])

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return t('dates.today')
    if (isYesterday(selectedDate)) return t('dates.yesterday')
    if (isTomorrow(selectedDate)) return t('dates.tomorrow')
    return format(
      selectedDate,
      locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM dd, yyyy',
      { locale: dateFnsLocale },
    )
  }, [selectedDate, t, locale, dateFnsLocale])

  // Search debounce
  useEffect(() => {
    if (searchDebounceTimer.current)
      clearTimeout(searchDebounceTimer.current)
    searchDebounceTimer.current = setTimeout(() => {
      setSearchQuery(searchQuery)
    }, 300)
    return () => {
      if (searchDebounceTimer.current)
        clearTimeout(searchDebounceTimer.current)
    }
  }, [searchQuery, setSearchQuery])

  // Build filters
  const filters = useMemo<HabitsFilter>(() => {
    if (activeView === 'general') {
      const f: HabitsFilter = { isGeneral: true }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      return f
    }

    const dateStr = formatAPIDate(selectedDate)

    if (activeView === 'today') {
      const f: HabitsFilter = {
        dateFrom: dateStr,
        dateTo: dateStr,
        includeOverdue: isToday(selectedDate),
        includeGeneral: true,
      }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      return f
    }

    // 'all' view
    const f: HabitsFilter = {}
    if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
    return f
  }, [activeView, selectedDate, searchQueryStore])

  // Tab keyboard navigation
  const handleTabKeydown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const idx = TAB_VIEWS.indexOf(activeView)
      if (idx === -1) return
      e.preventDefault()
      const nextIdx =
        e.key === 'ArrowRight'
          ? (idx + 1) % TAB_VIEWS.length
          : (idx - 1 + TAB_VIEWS.length) % TAB_VIEWS.length
      const nextView = TAB_VIEWS[nextIdx]
      if (nextView) setActiveView(nextView)
    },
    [activeView, setActiveView],
  )

  // Clear select mode when view changes
  useEffect(() => {
    if (isSelectMode) clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  return (
    <div className="relative">
      {/* Header: Orbit logo */}
      <header className="flex items-center justify-between pt-8 pb-2">
        <button
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={goToToday}
        >
          <img
            src="/logo-no-bg.png"
            alt="Orbit"
            className="size-10"
            width={40}
            height={40}
          />
          <span className="text-[length:var(--text-fluid-xl)] font-extrabold text-text-primary tracking-tight">
            Orbit
          </span>
        </button>
      </header>

      {/* Tabs: Today / All / General / Goals */}
      <div className="pt-4">
        <div
          role="tablist"
          aria-label={t('habits.viewsLabel')}
          className="flex bg-surface-ground rounded-[var(--radius-lg)] p-1 gap-1"
          onKeyDown={handleTabKeydown}
        >
          {TAB_VIEWS.map((view) => (
            <button
              key={view}
              id={`tab-${view}`}
              role="tab"
              aria-selected={activeView === view}
              aria-controls={
                view === 'goals' ? 'tabpanel-goals' : 'tabpanel-habits'
              }
              className={`flex-1 text-center py-2 text-sm font-bold transition-all duration-200 rounded-[var(--radius-md)] ${
                activeView === view
                  ? 'text-primary bg-surface shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => setActiveView(view)}
            >
              {view === 'today'
                ? t('habits.viewToday')
                : view === 'all'
                  ? t('habits.viewAll')
                  : view === 'general'
                    ? t('habits.viewGeneral')
                    : t('goals.tab')}
            </button>
          ))}
        </div>
      </div>

      {/* Goals view */}
      {activeView === 'goals' && <GoalsView />}

      {/* Date navigation (today view only) */}
      {activeView === 'today' && (
        <div className="pt-4 pb-4">
          <div className="flex items-center justify-center gap-4">
            <button
              aria-label={t('dates.previousDay')}
              className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
              onClick={goToPreviousDay}
            >
              <ChevronLeft className="size-5 text-text-secondary" />
            </button>
            <button
              className={`min-w-40 text-center text-[length:var(--text-fluid-base)] font-semibold text-text-primary hover:text-primary transition-colors ${
                isToday(selectedDate) ? 'text-primary' : ''
              }`}
              onClick={goToToday}
            >
              {dateLabel}
            </button>
            <button
              aria-label={t('dates.nextDay')}
              className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
              onClick={goToNextDay}
            >
              <ChevronRight className="size-5 text-text-secondary" />
            </button>
          </div>
        </div>
      )}

      {/* AI Summary card (Today view only) */}
      {activeView === 'today' &&
        isToday(selectedDate) &&
        profile?.hasProAccess &&
        profile?.aiSummaryEnabled && (
          <div className="pb-2">
            <HabitSummaryCard date={formatAPIDate(selectedDate)} />
          </div>
        )}

      {/* Habits content (hidden on goals tab) */}
      {activeView !== 'goals' && (
        <div
          id="tabpanel-habits"
          role="tabpanel"
          aria-labelledby={`tab-${activeView}`}
        >
          {/* Search bar */}
          <div className="pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-5 text-text-muted pointer-events-none" />
              <input
                value={searchQuery}
                type="text"
                placeholder={t('habits.searchPlaceholder')}
                className="w-full bg-surface text-text-primary placeholder-text-muted rounded-full py-3 pl-12 pr-12 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                onChange={(e) => setLocalSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-secondary hover:text-text-primary transition-colors"
                  onClick={() => setLocalSearchQuery('')}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className="pb-2 flex items-center justify-end gap-2">
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                showCompleted
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-faded hover:text-text-primary'
              }`}
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {showCompleted ? (
                <Eye className="size-3" />
              ) : (
                <EyeOff className="size-3" />
              )}
              {t('habits.showCompleted')}
            </button>
          </div>

          {/* Select mode bar */}
          {isSelectMode && (
            <div className="flex items-center gap-2 pb-3">
              <span className="text-xs font-bold text-text-muted">
                {selectedHabitIds.size} {t('common.selected')}
              </span>
              <div className="flex-1" />
              <button
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface border border-border text-text-secondary hover:text-text-primary transition-all"
                onClick={clearSelection}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

          {/* Habit list */}
          <HabitList
            view={activeView === 'today' || activeView === 'all' || activeView === 'general' ? activeView : 'today'}
            selectedDate={selectedDate}
            showCompleted={showCompleted}
            isSelectMode={isSelectMode}
            selectedHabitIds={selectedHabitIds}
            searchQuery={searchQueryStore}
            filters={filters}
            onToggleSelection={toggleHabitSelection}
            onEnterSelectMode={(habitId) => {
              if (!isSelectMode) toggleSelectMode()
              toggleHabitSelection(habitId)
            }}
            onCreate={() => setShowCreateModal(true)}
            onSeeUpcoming={() => setActiveView('all')}
          />
        </div>
      )}

      {/* Floating action button */}
      {activeView !== 'goals' && !isSelectMode && (
        <button
          className="fixed bottom-24 right-6 z-50 size-14 rounded-full bg-primary text-white shadow-[var(--shadow-glow)] flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all duration-150"
          aria-label={t('habits.createHabit')}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="size-6" />
        </button>
      )}

      {/* Create habit modal */}
      <CreateHabitModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        initialDate={
          activeView === 'today' ? formatAPIDate(selectedDate) : null
        }
      />
    </div>
  )
}
