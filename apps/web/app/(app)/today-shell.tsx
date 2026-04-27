'use client'

import Image from 'next/image'
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
    <header className="pt-6 pb-2">
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-border-muted bg-surface-ground/85 px-3 py-3 shadow-[var(--shadow-sm)] backdrop-blur-xl [box-shadow:var(--shadow-sm),inset_0_1px_0_var(--surface-top-highlight)]">
        <button
          className="flex min-h-11 items-center gap-3 rounded-[var(--radius-lg)] px-1 cursor-pointer transition-[opacity,transform] duration-150 ease-out hover:opacity-85 active:scale-[var(--orbit-press-scale)]"
          onClick={onGoToToday}
          aria-label={goToTodayLabel}
        >
          <span className="grid size-10 place-items-center rounded-[var(--radius-lg)] border border-primary/20 bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Image
              src="/logo-no-bg.png"
              alt="Orbit"
              className="size-8"
              width={32}
              height={32}
            />
          </span>
          <span className="text-[length:var(--text-fluid-xl)] font-extrabold text-text-primary tracking-tight">
            Orbit
          </span>
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span data-tour="tour-streak-badge"><StreakBadge streak={streak} /></span>
          <NotificationBell />
        </div>
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
    <div className="pt-3" data-tour="tour-tabs-bar">
      <div
        role="tablist"
        tabIndex={0}
        aria-label={viewsLabel}
        className="flex gap-1 rounded-[var(--radius-lg)] border border-border-muted bg-surface-ground/85 p-1 shadow-[inset_0_1px_0_var(--surface-top-highlight)]"
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
            data-tour={tab.view === 'goals' ? 'tour-goals-tab' : undefined}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] border text-center text-sm font-bold transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out active:scale-[var(--orbit-press-scale)] ${
              activeView === tab.view
                ? 'border-border-muted bg-surface text-primary shadow-[var(--shadow-sm)]'
                : 'border-transparent text-text-secondary hover:bg-surface/55 hover:text-text-primary'
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
    <div className="pt-4 pb-4" data-tour="tour-date-nav">
      <div className="flex items-center justify-center gap-4">
        <button
          aria-label={previousLabel}
          className="flex size-11 items-center justify-center rounded-full border border-border-muted bg-surface shadow-[var(--shadow-sm)] transition-[background-color,border-color,transform,box-shadow] duration-150 ease-out hover:border-border-emphasis hover:bg-surface-elevated active:scale-[var(--orbit-press-scale)]"
          onClick={onGoToPreviousDay}
        >
          <ChevronLeft className="size-5 text-text-secondary" />
        </button>
        <button
          key={dateLabel}
          aria-label={isTodaySelected ? dateLabel : todayLabel}
          className={`inline-flex min-h-11 min-w-40 items-center justify-center rounded-[var(--radius-lg)] px-4 text-center text-[length:var(--text-fluid-base)] font-semibold text-text-primary transition-[color,background-color,transform] duration-150 ease-out hover:bg-surface/55 hover:text-primary active:scale-[var(--orbit-press-scale)] animate-slide-date-${slideDirection} ${
            isTodaySelected ? 'text-primary' : ''
          }`}
          onClick={onGoToToday}
        >
          {dateLabel}
        </button>
        <button
          aria-label={nextLabel}
          className="flex size-11 items-center justify-center rounded-full border border-border-muted bg-surface shadow-[var(--shadow-sm)] transition-[background-color,border-color,transform,box-shadow] duration-150 ease-out hover:border-border-emphasis hover:bg-surface-elevated active:scale-[var(--orbit-press-scale)]"
          onClick={onGoToNextDay}
        >
          <ChevronRight className="size-5 text-text-secondary" />
        </button>
      </div>
    </div>
  )
}
