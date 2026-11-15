'use client'

import type { ReactNode, Ref } from 'react'
import { useTranslations } from 'next-intl'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { buildSearchSections, type CommandHabitEntry } from '@orbit/shared/utils'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import type { useHabitSearch } from '@/hooks/use-habit-search'
import { SearchEmpty, SearchResults, Searching } from './search-results'
import { SearchOrbitLine } from './search-question-block'

interface GuidedSearchOutcomeProps {
  search: ReturnType<typeof useHabitSearch>
  entries: readonly CommandHabitEntry[]
  mascotRef: Ref<HTMLSpanElement>
  lookAt: OrbitLookTarget | null
  onOpen: (id: string) => void
  onCreate: () => void
  createRefusal: boolean
}

function renderQueryText(chunks: ReactNode) { return <span>{chunks}</span> }

/** False in the short wait before the search shows its status. The Orbit line then has no job, so it is absent. */
export function hasSearchLine(search: Pick<ReturnType<typeof useHabitSearch>, 'busy' | 'showLoading' | 'isError'>): boolean {
  return !search.busy || search.showLoading || search.isError
}

/**
 * What the search gave, under the question: Orbit at 48 beside one sentence (the status, the count, the miss or the load error),
 * then the rows. The sentence comes from the result set the search already holds, so it starts no request of its own.
 */
export function GuidedSearchOutcome({ search, entries, mascotRef, lookAt, onOpen, onCreate, createRefusal }: Readonly<GuidedSearchOutcomeProps>) {
  const t = useTranslations()
  const settled = !search.busy && !search.isError
  const found = settled && entries.length > 0
  const miss = settled && entries.length === 0
  const count = t('habits.search.line.count', { count: search.data?.totalCount ?? 0 })
  const spoken = found ? count : miss ? t.markup('habits.search.emptyTitle', { query: search.query, queryText: (chunks) => chunks }) : null
  const announcement = useFlowAnnouncement(spoken, 'search')
  let line: ReactNode = null
  if (search.showLoading) line = <Searching />
  else if (search.isError) line = <InlineLoadError message={t('habits.search.loadError')} onRetry={() => void search.refetch()} />
  else if (found) line = <p data-search-line="count">{count}</p>
  else if (miss) line = <p data-search-line="miss">{t.rich('habits.search.emptyTitle', { query: search.query, queryText: renderQueryText })}</p>
  return <>
    {hasSearchLine(search) ? <SearchOrbitLine mascotRef={mascotRef} lookAt={miss || search.isError ? null : lookAt}>{line}</SearchOrbitLine> : null}
    <p role="status" className="sr-only">{announcement}</p>
    {found ? <SearchResults today={search.today} sections={buildSearchSections(entries)} query={search.query} onOpen={onOpen} /> : null}
    {miss ? <SearchEmpty query={search.query} onCreate={onCreate} createRefusal={createRefusal} showTitle={false} /> : null}
  </>
}
