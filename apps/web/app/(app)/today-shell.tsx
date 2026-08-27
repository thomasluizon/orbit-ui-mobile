'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X, Filter } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { AppLogo } from '@/components/ui/app-logo'
import { Menu } from '@/components/ui/menu'
import { ControlsMenu, type ControlsMenuProps } from '@/components/habits/controls-menu'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { TagChip } from '@/components/ui/tag-chip'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'
import type { Tag } from '@/hooks/use-tags'

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

interface TodayHeaderProps {
  streak: number
}

/** Início header: the Orbit mark over the gradient, with the theme toggle,
 *  streak flame, and notification bell clustered top-right. */
export function TodayHeader({ streak }: Readonly<TodayHeaderProps>) {
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo(profile?.canViewGamification ?? false)

  return (
    <div
      className="relative z-[1] flex items-center justify-between"
      style={{ padding: '12px 20px 0', gap: 12 }}
    >
      <span className="inline-flex shrink-0">
        <AppLogo size={28} />
      </span>
      <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
        <ThemeToggle />
        <span data-tour="tour-streak-badge">
          <StreakBadge streak={streak} isFrozen={streakInfo?.isFrozenToday ?? false} />
        </span>
        <NotificationBell />
      </div>
    </div>
  )
}

interface TodayTabsProps {
  tabs: TodayTabItem[]
  activeView: TodayTabView
  hasProAccess: boolean
  onChangeView: (view: TodayTabView) => boolean | void
  viewsLabel: string
}

export function TodayTabs({
  tabs,
  activeView,
  hasProAccess,
  onChangeView,
  viewsLabel,
}: Readonly<TodayTabsProps>) {
  const tabItems: SectionHeadTabItem<TodayTabView>[] = tabs.map((tab) => ({
    id: tab.view,
    label: tab.label,
    locked: tab.view === 'goals' && !hasProAccess,
    dataTour: tab.view === 'goals' ? 'tour-goals-tab' : undefined,
  }))

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const idx = tabs.findIndex((tab) => tab.view === activeView)
    if (idx === -1) return
    event.preventDefault()
    const nextIdx =
      event.key === 'ArrowRight'
        ? (idx + 1) % tabs.length
        : (idx - 1 + tabs.length) % tabs.length
    const nextView = tabs[nextIdx]?.view
    if (nextView && onChangeView(nextView) !== false) {
      requestAnimationFrame(() => {
        document.getElementById(`tab-${nextView}`)?.focus()
      })
    }
  }

  return (
    <div data-tour="tour-tabs-bar">
      <SectionHeadTabs
        tabs={tabItems}
        active={activeView}
        onChange={onChangeView}
        ariaLabel={viewsLabel}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

interface TodayDateNavigationProps {
  visible: boolean
  dateLabel: string
  isTodaySelected: boolean
  slideDirection: 'left' | 'right'
  animateDateChange: boolean
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
  /** Drops the in-page padding and the full-width stretch so the row sits inline
   *  in the desktop topbar's left slot. */
  compact?: boolean
}

export function TodayDateNavigation({
  visible,
  dateLabel,
  isTodaySelected,
  slideDirection,
  animateDateChange,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  previousLabel,
  todayLabel,
  nextLabel,
  compact = false,
}: Readonly<TodayDateNavigationProps>) {
  if (!visible) return null

  const slideAnimationClass = animateDateChange
    ? ` animate-slide-date-${slideDirection}`
    : ''

  return (
    <div
      className="shrink-0"
      data-tour={compact ? undefined : 'tour-date-nav'}
      style={{
        padding: compact ? 0 : '12px 20px 16px',
      }}
    >
      <div
        className={compact ? 'flex items-center' : 'flex items-center justify-between w-full'}
        style={{
          padding: compact ? 0 : '0 4px',
          gap: compact ? 2 : undefined,
        }}
      >
        <button
          type="button"
          aria-label={previousLabel}
          className="icon-btn touch-target-y shrink-0"
          style={{ width: 36, height: 36 }}
          onClick={onGoToPreviousDay}
        >
          <ChevronLeft size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
        <button
          type="button"
          key={dateLabel}
          aria-label={isTodaySelected ? dateLabel : todayLabel}
          className={`appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]${slideAnimationClass}`}
          style={{
            height: 36,
            padding: '0 16px',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--primary)',
          }}
          onClick={onGoToToday}
        >
          {dateLabel}
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          className="icon-btn touch-target-y shrink-0"
          style={{ width: 36, height: 36 }}
          onClick={onGoToNextDay}
        >
          <ChevronRight size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

export interface TodayUtilityRowProps {
  activeView: TodayTabView
  searchOpen: boolean
  searchValue: string
  selectedFrequency: FreqKey | null
  selectedTagIds: string[]
  tags: Tag[]
  frequencyOptions: Array<{ key: FreqKey; label: string }>
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onSearchToggle: () => void
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  onFrequencyChange: (key: FreqKey | null) => void
  onTagToggle: (tagId: string) => void
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
}

export function TodayUtilityRow({
  activeView,
  searchOpen,
  searchValue,
  selectedFrequency,
  selectedTagIds,
  tags,
  frequencyOptions,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onSearchToggle,
  onSearchChange,
  onSearchClear,
  onFrequencyChange,
  onTagToggle,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
}: Readonly<TodayUtilityRowProps>) {
  const t = useTranslations()
  const showFreq = activeView !== 'general'
  const searchActive = searchValue.trim().length > 0

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: '10px 20px',
        gap: searchOpen ? 8 : 0,
      }}
    >
      <button
        type="button"
        aria-label={t('habits.searchPlaceholder')}
        aria-pressed={searchActive}
        onClick={onSearchToggle}
        className="icon-btn touch-target-y shrink-0"
        style={{
          width: 36,
          height: 36,
          background: searchActive ? 'var(--selection-bg)' : undefined,
          boxShadow: searchActive
            ? 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.45)'
            : 'none',
        }}
      >
        <Search
          size={18}
          strokeWidth={1.8}
          color={searchActive ? 'var(--primary)' : 'var(--fg-2)'}
          aria-hidden="true"
        />
      </button>
      {searchOpen ? (
        <div
          className="flex items-center flex-1 min-w-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
          style={{
            gap: 8,
            minHeight: 44,
            borderRadius: 999,
            background: 'var(--bg-elev)',
            padding: '0 8px 0 16px',
          }}
        >
          <Search size={18} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('habits.searchPlaceholder')}
            autoFocus
            className="appearance-none border-0 bg-transparent flex-1 min-w-0"
            style={{
              // react-doctor-disable-next-line no-outline-none -- focus ring is shown on the wrapper via focus-within:shadow-[inset_0_0_0_2px_var(--primary)] https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              color: 'var(--fg-1)',
            }}
          />
          <button
            type="button"
            aria-label={searchValue ? t('common.clear') : t('habits.closeSearch')}
            onClick={searchValue ? onSearchClear : onSearchToggle}
            className="icon-btn touch-target-y shrink-0"
            style={{ width: 36, height: 36 }}
          >
            <X size={16} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <TodayUtilityFilters
          showFreq={showFreq}
          tags={tags}
          selectedTagIds={selectedTagIds}
          selectedFrequency={selectedFrequency}
          frequencyOptions={frequencyOptions}
          onTagToggle={onTagToggle}
          onFrequencyChange={onFrequencyChange}
          controls={{
            isSelectMode,
            showCompleted,
            isFetching,
            allCollapsed,
            onToggleSelect,
            onToggleCollapse,
            onRefresh,
            onToggleCompleted,
          }}
        />
      )}
    </div>
  )
}

interface TodayUtilityFiltersProps {
  showFreq: boolean
  tags: Tag[]
  selectedTagIds: string[]
  selectedFrequency: FreqKey | null
  frequencyOptions: Array<{ key: FreqKey; label: string }>
  onTagToggle: (tagId: string) => void
  onFrequencyChange: (key: FreqKey | null) => void
  controls: ControlsMenuProps
}

function TodayUtilityFilters({
  showFreq,
  tags,
  selectedTagIds,
  selectedFrequency,
  frequencyOptions,
  onTagToggle,
  onFrequencyChange,
  controls,
}: Readonly<TodayUtilityFiltersProps>) {
  const t = useTranslations()
  const selectedTagIdSet = new Set(selectedTagIds)

  return (
    <>
      <div
        className="flex items-center flex-1 min-w-0 overflow-x-auto thin-scrollbar"
        style={{ gap: 8, padding: '4px 4px' }}
      >
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            active={selectedTagIdSet.has(tag.id)}
            onClick={() => onTagToggle(tag.id)}
          />
        ))}
      </div>
      {showFreq && (
        <FrequencyFunnel
          selected={selectedFrequency}
          options={frequencyOptions}
          onChange={onFrequencyChange}
          triggerAriaLabel={t('habits.frequencyFilter')}
          allLabel={t('common.all')}
        />
      )}
      <ControlsMenu {...controls} />
    </>
  )
}

interface FrequencyFunnelProps {
  selected: FreqKey | null
  options: Array<{ key: FreqKey; label: string }>
  onChange: (key: FreqKey | null) => void
  triggerAriaLabel: string
  allLabel: string
}

function FrequencyFunnel({
  selected,
  options,
  onChange,
  triggerAriaLabel,
  allLabel,
}: Readonly<FrequencyFunnelProps>) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const items = [
    { id: 'all', label: allLabel, badge: selected == null ? '✓' : undefined },
    ...options.map((option) => ({
      id: option.key,
      label: option.label,
      badge: selected === option.key ? '✓' : undefined,
    })),
  ]

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={triggerAriaLabel}
        aria-pressed={selected != null}
        aria-expanded={open}
        className="icon-btn touch-target-y shrink-0"
        style={{ width: 36, height: 36, background: selected ? 'var(--selection-bg)' : undefined }}
        onClick={() => setOpen((current) => !current)}
      >
        <Filter size={18} strokeWidth={1.8} color={selected ? 'var(--primary)' : 'var(--fg-2)'} aria-hidden="true" />
      </button>
      <Menu
        open={open}
        anchorRef={anchorRef}
        title={triggerAriaLabel}
        items={items}
        onClose={() => setOpen(false)}
        onSelect={(id) => onChange(id === 'all' ? null : selected === id ? null : id as FreqKey)}
      />
    </>
  )
}

