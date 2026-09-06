'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { CommandItem } from 'cmdk'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ChevronRight, Circle } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { HabitMatchLine } from './habit-match-line'

export function Searching() {
  const t = useTranslations()
  return <output aria-live="polite" aria-label={t('habits.search.searching')} className="flex items-center gap-3 p-3 text-[length:var(--fs-sm)] text-[var(--fg-3)]">
    <span aria-hidden className="flex gap-1">{[0, 1, 2].map((index) => <span key={index} className="search-dot size-1 rounded-full bg-[var(--fg-3)]" style={{ animationDelay: `${index * 0.15}s` }} />)}</span>
    {t('habits.search.searching')}
  </output>
}

function renderQueryText(chunks: ReactNode) { return <span>{chunks}</span> }

export function SearchEmpty({ query, onCreate }: Readonly<{ query: string; onCreate: () => void }>) {
  const t = useTranslations()
  const wide = useIsWideDesktop()
  return <div className="flex flex-col items-start gap-3 p-3">
    <p className="text-[length:var(--fs-md)]">{t.rich('habits.search.emptyTitle', { query, queryText: renderQueryText })}</p>
    <p className="text-[length:var(--fs-sm)] text-[var(--fg-3)]">{t('habits.search.emptyBody')}</p>
    <Button size="sm" variant={wide ? 'secondary' : 'primary'} onClick={onCreate}>{t('habits.search.create')}</Button>
  </div>
}

export function SearchResults({ habits, query, onOpen, totalCount }: Readonly<{ habits: readonly NormalizedHabit[]; totalCount: number; query: string; onOpen: (id: string) => void }>) {
  const t = useTranslations()
  return <div className="flex flex-col gap-4">
    <p className="px-1 font-mono text-[length:var(--fs-xs)] text-[var(--fg-4)]">{t('habits.search.count', { count: totalCount })}</p>
    <div className="flex flex-col gap-2">{habits.map((habit) => <CommandItem key={habit.id} asChild value={habit.id} onSelect={() => onOpen(habit.id)}><button type="button" className="flex min-h-11 items-center gap-3 rounded-[var(--r-well)] bg-[var(--bg-card)] p-3 text-left shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-[var(--bg-hover)] data-[selected=true]:bg-[var(--primary-dim)] data-[selected=true]:shadow-[inset_0_0_0_1.5px_var(--primary)] focus-visible:outline-2">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--r-well)] bg-[var(--bg-well)] text-xl">{habit.emoji || <Circle size={20} />}</span>
      <span className="min-w-0 flex-1"><span className="sr-only">{t('habits.search.open', { name: habit.title })}</span>{' '}<span aria-hidden className="block truncate text-[length:var(--fs-md)] text-[var(--fg-1)]">{habit.title}</span><HabitMatchLine habit={habit} query={query} /></span>
      <ChevronRight size={20} className="shrink-0 text-[var(--fg-4)]" aria-hidden />
    </button></CommandItem>)}</div>
  </div>
}
