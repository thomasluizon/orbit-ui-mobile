'use client'

import { ChevronLeft, ChevronRight, Search, X, Filter, Check } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { AppLogo } from '@/components/ui/app-logo'
import { Popover } from '@/components/ui/popover'
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

/** Today header: the Orbit mark, with the theme toggle, streak flame, and
 *  notification bell clustered top-right. */
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

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: '8px 8px 8px 12px',
        gap: 0,
      }}
    >
      {searchOpen ? (
        <div
          className="field-ring flex items-center flex-1 min-w-0 box-border"
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
            className="appearance-none border-0 bg-transparent flex-1 min-w-0 box-border"
            style={{
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
          onSearchToggle={onSearchToggle}
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
  onSearchToggle: () => void
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
  onSearchToggle,
  onTagToggle,
  onFrequencyChange,
  controls,
}: Readonly<TodayUtilityFiltersProps>) {
  const t = useTranslations()
  const selectedTagIdSet = new Set(selectedTagIds)

  return (
    <>
      <button
        type="button"
        aria-label={t('habits.searchPlaceholder')}
        onClick={onSearchToggle}
        className="icon-btn touch-target-y shrink-0"
        style={{ width: 36, height: 36 }}
      >
        <Search size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
      </button>
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
  return (
    <Popover
      placement="bottom-end"
      className="min-w-[180px]"
      trigger={
        <button
          type="button"
          aria-label={triggerAriaLabel}
          aria-pressed={selected != null}
          className="icon-btn touch-target-y shrink-0"
          style={{
            width: 36,
            height: 36,
            background: selected ? 'var(--selection-bg)' : undefined,
            boxShadow: selected
              ? 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.45)'
              : 'none',
          }}
        >
          <Filter
            size={18}
            strokeWidth={1.8}
            color={selected ? 'var(--primary)' : 'var(--fg-2)'}
            aria-hidden="true"
          />
        </button>
      }
    >
      {(close) => (
        <>
          <FrequencyMenuRow
            active={!selected}
            label={allLabel}
            onClick={() => {
              onChange(null)
              close()
            }}
          />
          {options.map((opt) => (
            <FrequencyMenuRow
              key={opt.key}
              active={selected === opt.key}
              label={opt.label}
              onClick={() => {
                onChange(selected === opt.key ? null : opt.key)
                close()
              }}
            />
          ))}
        </>
      )}
    </Popover>
  )
}

interface FrequencyMenuRowProps {
  active: boolean
  label: string
  onClick: () => void
}

function FrequencyMenuRow({ active, label, onClick }: Readonly<FrequencyMenuRowProps>) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-sunk)]"
      style={{
        padding: '10px 12px',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
        textAlign: 'left',
        borderRadius: 8,
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{ width: 16, color: 'var(--primary)' }}
      >
        {active ? <Check size={16} strokeWidth={2} /> : null}
      </span>
      {label}
    </button>
  )
}

