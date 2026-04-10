'use client'

import { Search, X, MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Tag } from '@/hooks/use-tags'

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

export interface TodayFiltersProps {
  activeView: string
  localSearchQuery: string
  selectedFrequency: FreqKey | null
  selectedTagIds: string[]
  tags: Tag[]
  frequencyOptions: Array<{ key: FreqKey; label: string }>
  controlsMenuRef: React.RefObject<HTMLDivElement | null>
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  onFrequencyChange: (key: FreqKey | null) => void
  onTagToggle: (tagId: string) => void
  onOpenControlsMenu: () => void
}

export function TodayFilters({
  activeView,
  localSearchQuery,
  selectedFrequency,
  selectedTagIds,
  tags,
  frequencyOptions,
  controlsMenuRef,
  onSearchChange,
  onSearchClear,
  onFrequencyChange,
  onTagToggle,
  onOpenControlsMenu,
}: TodayFiltersProps) {
  const t = useTranslations()

  return (
    <>
      {/* Search bar */}
      <div className="pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-5 text-text-muted pointer-events-none" />
          <input
            value={localSearchQuery}
            type="text"
            aria-label={t('habits.searchPlaceholder')}
            placeholder={t('habits.searchPlaceholder')}
            className="w-full bg-surface text-text-primary placeholder-text-muted rounded-full py-3 pl-12 pr-12 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {localSearchQuery && (
            <button
              aria-label={t('common.clear')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-secondary hover:text-text-primary transition-colors"
              onClick={onSearchClear}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips + controls row */}
      <div className="pb-2 flex items-center gap-2">
        {activeView !== 'general' || tags.length > 0 ? (
          <div className="flex-1 overflow-x-auto thin-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
            <div className="flex gap-2 min-w-max">
              {/* Frequency chips (hidden in general view) */}
              {activeView !== 'general' && (
                <>
                  <button
                    aria-pressed={!selectedFrequency}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                      selectedFrequency
                        ? 'bg-surface border border-border text-text-faded hover:text-text-primary'
                        : 'bg-primary text-white'
                    }`}
                    onClick={() => onFrequencyChange(null)}
                  >
                    {t('common.all')}
                  </button>
                  {frequencyOptions.map((opt) => (
                    <button
                      key={opt.key}
                      aria-pressed={selectedFrequency === opt.key}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                        selectedFrequency === opt.key
                          ? 'bg-primary text-white'
                          : 'bg-surface border border-border text-text-faded hover:text-text-primary'
                      }`}
                      onClick={() =>
                        onFrequencyChange(
                          selectedFrequency === opt.key ? null : opt.key,
                        )
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </>
              )}
              {/* Tag chips */}
              {tags.length > 0 && (
                <>
                  {activeView !== 'general' && (
                    <span className="w-px h-6 bg-border self-center" />
                  )}
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        selectedTagIds.includes(tag.id)
                          ? 'text-white'
                          : 'bg-surface border border-border text-text-faded hover:text-text-primary'
                      }`}
                      style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
                      onClick={() => onTagToggle(tag.id)}
                    >
                      {!selectedTagIds.includes(tag.id) && (
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      {tag.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div ref={controlsMenuRef} className="shrink-0">
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface"
            title={t('habits.actions.more')}
            aria-label={t('habits.actions.more')}
            onClick={(e) => {
              e.stopPropagation()
              onOpenControlsMenu()
            }}
          >
            <MoreVertical className="size-5" />
          </button>
        </div>
      </div>
    </>
  )
}
