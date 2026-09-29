'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { CommandGroup, CommandInput } from 'cmdk'
import { ArrowLeft, Search } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'

export const GROUP_CLASS =
  'mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-[var(--fg-3)] [&_[cmdk-group-heading]]:font-mono'

const SKELETON_ROW_WIDTHS = ['62%', '48%', '71%'] as const

export function CommandHabitSkeleton({ heading }: Readonly<{ heading: string }>) {
  return (
    <CommandGroup forceMount heading={heading} className={GROUP_CLASS}>
      <div aria-hidden="true">
        {SKELETON_ROW_WIDTHS.map((width) => (
          <div key={width} className="flex min-h-[44px] items-center gap-3 px-3">
            <span className="skeleton-pulse size-6 shrink-0 rounded-[8px] bg-[var(--bg-well)]" />
            <span
              className="skeleton-pulse h-4 rounded-[8px] bg-[var(--bg-well)]"
              style={{ width }}
            />
          </div>
        ))}
      </div>
    </CommandGroup>
  )
}

export function CommandKeyHint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <span className="flex items-center gap-2">
      {keys.map((key) => (
        <kbd
          key={key}
          className="t-meta flex h-6 min-w-6 items-center justify-center rounded-[8px] px-1"
          style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
        >
          {key}
        </kbd>
      ))}
      <span className="t-meta lowercase">{label}</span>
    </span>
  )
}

export function CommandSearchField({ search, setSearch, activePageLabel, onBack, searchMode = false }: Readonly<{ search: string; setSearch: (value: string) => void; activePageLabel: string | null; onBack: () => void; searchMode?: boolean }>) {
  const t = useTranslations()
  const fieldLabel = t(searchMode ? 'habits.search.title' : 'command.title')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (activePageLabel !== null) inputRef.current?.focus()
  }, [activePageLabel])
  return (
      <div className="flex items-center gap-2 p-4 shadow-[inset_0_-1px_0_var(--hairline)]">
      {activePageLabel !== null && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            label={t('common.back')}
            onClick={() => {
              onBack()
              inputRef.current?.focus()
            }}
          >
            <ArrowLeft size={20} strokeWidth={1.8} aria-hidden />
          </Button>
          <span
            className="rounded-[8px] px-3 py-1 text-[12px] font-medium text-[var(--fg-2)]"
            style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
          >
            {activePageLabel}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="relative">
          <CommandInput
            ref={inputRef}
            aria-label={fieldLabel}
            value={search}
            onValueChange={setSearch}
            placeholder={t(searchMode ? 'habits.search.title' : 'command.placeholder')}
            className="h-[54px] w-full rounded-[12px] bg-[var(--bg-field)] px-4 pr-12 text-[16px] text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none placeholder:text-[var(--fg-3)] focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-visible:border-2 forced-colors:focus-visible:border-[Highlight]"
          />
          <Search className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[var(--fg-3)]" strokeWidth={1.8} aria-hidden />
        </div>
      </div>

      </div>
 )
}
