'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

interface TodayHeaderProps {
  onGoToToday: () => void
  streak: number
  goToTodayLabel: string
}

export function TodayHeader({
  onGoToToday,
  streak,
  goToTodayLabel,
}: Readonly<TodayHeaderProps>) {
  return (
    <header className="flex items-center justify-between pt-8 pb-2">
      <button
        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={onGoToToday}
        aria-label={goToTodayLabel}
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
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <StreakBadge streak={streak} />
        <NotificationBell />
      </div>
    </header>
  )
}

interface TodayTabsProps {
  tabs: TodayTabItem[]
  activeView: TodayTabView
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

export function TodayTabs({
  tabs,
  activeView,
  onChangeView,
  viewsLabel,
  onKeyDown,
}: Readonly<TodayTabsProps>) {
  return (
    <div className="pt-4">
      <div
        role="tablist"
        tabIndex={0}
        aria-label={viewsLabel}
        className="flex bg-surface-ground rounded-[var(--radius-lg)] p-1 gap-1"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.view}
            id={`tab-${tab.view}`}
            role="tab"
            aria-selected={activeView === tab.view}
            aria-controls={
              tab.view === 'goals' ? 'tabpanel-goals' : 'tabpanel-habits'
            }
            className={`flex-1 text-center py-2 text-sm font-bold transition-all duration-200 rounded-[var(--radius-md)] ${
              activeView === tab.view
                ? 'text-primary bg-surface shadow-[var(--shadow-sm)]'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => onChangeView(tab.view)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TodayDateNavigationProps {
  visible: boolean
  dateLabel: string
  isTodaySelected: boolean
  slideDirection: 'left' | 'right'
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
}

export function TodayDateNavigation({
  visible,
  dateLabel,
  isTodaySelected,
  slideDirection,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  previousLabel,
  todayLabel,
  nextLabel,
}: Readonly<TodayDateNavigationProps>) {
  if (!visible) return null

  return (
    <div className="pt-4 pb-4">
      <div className="flex items-center justify-center gap-4">
        <button
          aria-label={previousLabel}
          className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
          onClick={onGoToPreviousDay}
        >
          <ChevronLeft className="size-5 text-text-secondary" />
        </button>
        <button
          key={dateLabel}
          aria-label={isTodaySelected ? dateLabel : todayLabel}
          className={`min-w-40 text-center text-[length:var(--text-fluid-base)] font-semibold text-text-primary hover:text-primary transition-colors animate-slide-date-${slideDirection} ${
            isTodaySelected ? 'text-primary' : ''
          }`}
          onClick={onGoToToday}
        >
          {dateLabel}
        </button>
        <button
          aria-label={nextLabel}
          className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
          onClick={onGoToNextDay}
        >
          <ChevronRight className="size-5 text-text-secondary" />
        </button>
      </div>
    </div>
  )
}
