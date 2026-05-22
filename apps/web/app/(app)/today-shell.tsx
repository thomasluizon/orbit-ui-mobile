'use client'

import { ChevronLeft, ChevronRight, Search, X, MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SaturnDropcap } from '@/components/ui/saturn-dropcap'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { Chip } from '@/components/ui/chip'
import { TagChip } from '@/components/ui/tag-chip'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import type { Tag } from '@/hooks/use-tags'

// ---------------------------------------------------------------------------
// Tab view type (preserved from previous shell)
// ---------------------------------------------------------------------------

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

// ---------------------------------------------------------------------------
// Header (AppBar with leading sun icon + Today/date + trailing cluster)
// ---------------------------------------------------------------------------

interface TodayHeaderProps {
  title: string
  subtitle?: string
  streak: number
}

export function TodayHeader({
  title,
  subtitle,
  streak,
}: Readonly<TodayHeaderProps>) {
  return (
    <AppBar
      leadingIcon={
        <span style={{ color: 'var(--fg-2)' }}>
          <SaturnDropcap size={20} strokeWidth={1.4} />
        </span>
      }
      title={title}
      subtitle={subtitle}
      trailing={
        <>
          <ThemeToggle />
          <span data-tour="tour-streak-badge">
            <StreakBadge streak={streak} />
          </span>
          <NotificationBell />
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Section-head tabs (Today / All / General / Goals)
// ---------------------------------------------------------------------------

interface TodayTabsProps {
  tabs: TodayTabItem[]
  activeView: TodayTabView
  hasProAccess: boolean
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

export function TodayTabs({
  tabs,
  activeView,
  hasProAccess,
  onChangeView,
  viewsLabel,
  onKeyDown,
}: Readonly<TodayTabsProps>) {
  const tabItems: SectionHeadTabItem<TodayTabView>[] = tabs.map((tab) => ({
    id: tab.view,
    label: tab.label,
    locked: tab.view === 'goals' && !hasProAccess,
  }))

  return (
    <div data-tour="tour-tabs-bar">
      <SectionHeadTabs
        tabs={tabItems}
        active={activeView}
        onChange={onChangeView}
        ariaLabel={viewsLabel}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Date navigation (prev / today / next)
// ---------------------------------------------------------------------------

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
    <div
      className="flex items-center justify-center shrink-0"
      data-tour="tour-date-nav"
      style={{
        padding: '12px 20px',
        gap: 16,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <button
        type="button"
        aria-label={previousLabel}
        className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          color: 'var(--fg-2)',
        }}
        onClick={onGoToPreviousDay}
      >
        <ChevronLeft size={18} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        key={dateLabel}
        aria-label={isTodaySelected ? dateLabel : todayLabel}
        className={`appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center animate-slide-date-${slideDirection}`}
        style={{
          minWidth: 160,
          height: 36,
          fontFamily: 'var(--font-family-sans)',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          color: isTodaySelected ? 'var(--primary)' : 'var(--fg-1)',
        }}
        onClick={onGoToToday}
      >
        {dateLabel}
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          color: 'var(--fg-2)',
        }}
        onClick={onGoToNextDay}
      >
        <ChevronRight size={18} strokeWidth={1.6} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utility row — search/freq/tag chips + more menu
// ---------------------------------------------------------------------------

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

export interface TodayUtilityRowProps {
  activeView: TodayTabView
  searchOpen: boolean
  searchValue: string
  selectedFrequency: FreqKey | null
  selectedTagIds: string[]
  tags: Tag[]
  frequencyOptions: Array<{ key: FreqKey; label: string }>
  controlsMenuRef: React.RefObject<HTMLDivElement | null>
  onSearchToggle: () => void
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  onFrequencyChange: (key: FreqKey | null) => void
  onTagToggle: (tagId: string) => void
  onOpenControlsMenu: () => void
}

export function TodayUtilityRow({
  activeView,
  searchOpen,
  searchValue,
  selectedFrequency,
  selectedTagIds,
  tags,
  frequencyOptions,
  controlsMenuRef,
  onSearchToggle,
  onSearchChange,
  onSearchClear,
  onFrequencyChange,
  onTagToggle,
  onOpenControlsMenu,
}: Readonly<TodayUtilityRowProps>) {
  const t = useTranslations()
  const showFreq = activeView !== 'general'

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: '10px 8px 10px 12px',
        gap: 0,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      {searchOpen ? (
        <div className="flex items-center flex-1" style={{ gap: 8, paddingLeft: 8 }}>
          <Search size={15} strokeWidth={1.6} color="var(--fg-3)" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('habits.searchPlaceholder')}
            autoFocus
            className="appearance-none border-0 bg-transparent flex-1 min-w-0"
            style={{
              outline: 'none',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              color: 'var(--fg-1)',
            }}
          />
          {searchValue && (
            <button
              type="button"
              aria-label={t('common.clear')}
              onClick={onSearchClear}
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
              style={{ width: 28, height: 28, borderRadius: 6, color: 'var(--fg-3)' }}
            >
              <X size={14} strokeWidth={1.6} />
            </button>
          )}
          <button
            type="button"
            onClick={onSearchToggle}
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              padding: '6px 8px',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              color: 'var(--fg-2)',
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label={t('habits.searchPlaceholder')}
            onClick={onSearchToggle}
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0"
            style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--fg-3)' }}
          >
            <Search size={15} strokeWidth={1.6} />
          </button>
          <div
            className="flex items-center flex-1 min-w-0 overflow-x-auto thin-scrollbar"
            style={{ gap: 6 }}
          >
            {showFreq && (
              <>
                <Chip
                  active={!selectedFrequency}
                  onClick={() => onFrequencyChange(null)}
                  ariaLabel={t('common.all')}
                >
                  {t('common.all')}
                </Chip>
                {frequencyOptions.map((opt) => (
                  <Chip
                    key={opt.key}
                    active={selectedFrequency === opt.key}
                    onClick={() => onFrequencyChange(selectedFrequency === opt.key ? null : opt.key)}
                    ariaLabel={opt.label}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </>
            )}
            {showFreq && tags.length > 0 && (
              <div
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 16,
                  background: 'var(--hairline-strong)',
                  flexShrink: 0,
                  margin: '0 2px',
                }}
              />
            )}
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                active={selectedTagIds.includes(tag.id)}
                onClick={() => onTagToggle(tag.id)}
              />
            ))}
          </div>
          <div ref={controlsMenuRef} className="shrink-0">
            <button
              type="button"
              aria-label={t('habits.actions.more')}
              onClick={(e) => {
                e.stopPropagation()
                onOpenControlsMenu()
              }}
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: 8, color: 'var(--fg-3)' }}
            >
              <MoreHorizontal size={18} strokeWidth={1.6} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

