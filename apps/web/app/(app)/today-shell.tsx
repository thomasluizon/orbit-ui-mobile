'use client'

import { ChevronLeft, ChevronRight, Search, X, MoreHorizontal, Filter, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { Popover } from '@/components/ui/popover'
import { AppLogo } from '@/components/ui/app-logo'
import { SectionHeadTabs, type SectionHeadTabItem } from '@/components/ui/section-head-tabs'
import { TagChip } from '@/components/ui/tag-chip'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import type { Tag } from '@/hooks/use-tags'

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

export function getTodayTabLabel(
  view: TodayTabView,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (view) {
    case 'today':
      return t('habits.viewToday')
    case 'all':
      return t('habits.viewAll')
    case 'general':
      return t('habits.viewGeneral')
    case 'goals':
      return t('goals.tab')
  }
}

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
          <AppLogo size={20} />
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
      className="shrink-0"
      data-tour="tour-date-nav"
      style={{
        padding: '12px 20px 16px',
      }}
    >
      <div
        className="flex items-center w-full"
        style={{
          padding: '0 4px',
        }}
      >
        <button
          type="button"
          aria-label={previousLabel}
          className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0 text-[var(--fg-2)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
          style={{
            width: 32,
            height: 36,
            borderRadius: 8,
          }}
          onClick={onGoToPreviousDay}
        >
          <ChevronLeft size={16} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          key={dateLabel}
          aria-label={isTodaySelected ? dateLabel : todayLabel}
          className={`appearance-none border-0 bg-transparent cursor-pointer flex-1 inline-flex items-center justify-center transition-opacity duration-150 ease-out hover:opacity-80 animate-slide-date-${slideDirection}`}
          style={{
            height: 36,
            padding: '0 8px',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 500,
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
          className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0 text-[var(--fg-2)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
          style={{
            width: 32,
            height: 36,
            borderRadius: 8,
          }}
          onClick={onGoToNextDay}
        >
          <ChevronRight size={16} strokeWidth={1.6} />
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
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-3)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
              style={{ width: 28, height: 28, borderRadius: 6 }}
            >
              <X size={14} strokeWidth={1.6} />
            </button>
          )}
          <button
            type="button"
            onClick={onSearchToggle}
            className="appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-2)] transition-colors duration-150 ease-out hover:text-[var(--fg-1)]"
            style={{
              padding: '6px 8px',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
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
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center shrink-0 text-[var(--fg-3)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
            style={{ width: 36, height: 36, borderRadius: 8 }}
          >
            <Search size={15} strokeWidth={1.6} />
          </button>
          <div
            className="flex items-center flex-1 min-w-0 overflow-x-auto thin-scrollbar"
            style={{ gap: 8 }}
          >
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                active={selectedTagIds.includes(tag.id)}
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
          <div ref={controlsMenuRef} className="shrink-0">
            <button
              type="button"
              aria-label={t('habits.actions.more')}
              onClick={(e) => {
                e.stopPropagation()
                onOpenControlsMenu()
              }}
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-3)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
              style={{ width: 36, height: 36, borderRadius: 8 }}
            >
              <MoreHorizontal size={18} strokeWidth={1.6} />
            </button>
          </div>
        </>
      )}
    </div>
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
          className={
            'appearance-none border-0 cursor-pointer inline-flex items-center justify-center shrink-0 transition-[background-color,color] duration-150 ease-out ' +
            (selected
              ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]'
              : 'bg-transparent text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
          }
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            boxShadow: selected ? 'inset 0 0 0 1px var(--hairline-strong)' : 'none',
          }}
        >
          <Filter size={16} strokeWidth={1.6} />
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
      className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center transition-colors hover:bg-[var(--bg-sunk)]"
      style={{
        padding: '8px 10px',
        gap: 10,
        fontFamily: 'var(--font-family-sans)',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
        textAlign: 'left',
        borderRadius: 6,
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{ width: 14, color: 'var(--primary)' }}
      >
        {active ? <Check size={14} strokeWidth={2} /> : null}
      </span>
      {label}
    </button>
  )
}

