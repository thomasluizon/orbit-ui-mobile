'use client'

import { IconButton } from '@/components/ui/icon-button'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { ActionRow } from '@/components/ui/action-row'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command, CommandList } from 'cmdk'
import { buildHabitCreateHref, buildSearchEntries, buildSearchSections } from '@orbit/shared/utils'
import { PageHeader } from '@/components/ui/page-header'
import { CommandSearchField } from '@/components/command/command-menu-chrome'
import { SearchEmpty, SearchResults, Searching } from '@/components/search/search-results'
import { GuidedSearchOutcome, hasSearchLine } from '@/components/search/guided-search-outcome'
import { SearchQuestionBlock } from '@/components/search/search-question-block'

import { useFlag } from '@/hooks/use-flag'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useOffline } from '@/hooks/use-offline'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useAccountScopedState } from '@/hooks/use-session-reset'

export default function SearchPage() {
  const t = useTranslations()
  const router = useRouter()
  const search = useHabitSearch()
  const createHabit = (title = '') => router.push(buildHabitCreateHref({ title, from: '/search' }))
  const guided = useFlag('orbit_guided_flows')
  useOverlayEscape({ open: true, onDismiss: () => router.back(), restoreFocus: false })
  return <>
    <PageHeader title={t('habits.search.title')} titleHeading={!guided} onBack={() => router.back()} backLabel={t('common.back')} />
    <div className={guided ? 'mx-auto flex w-full max-w-[620px] flex-1 flex-col' : 'mx-auto w-full max-w-[620px]'}>
      <HabitSearch search={search} guided={guided} onCreateHabit={createHabit} />
    </div>
  </>
}

/** Where Orbit is drawn: above the question, beside the Orbit line, or nowhere while the line has no job. */
type OrbitPlace = 'block' | 'line' | 'none'

/** Orbit looks at the search field while it holds focus. The look is measured again when Orbit moves between the block and the line. */
function useFieldLook(place: OrbitPlace) {
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const field = useRef<EventTarget | null>(null)
  useEffect(() => { if (field.current) lookTowards(field.current) }, [place, lookTowards])
  return {
    mascotRef,
    lookAt,
    onFieldFocus: (event: FocusEvent<HTMLInputElement>) => { field.current = event.target; lookTowards(event.target) },
    onFieldBlur: () => { field.current = null; lookAway() },
  }
}

function HabitSearch({ search, guided, onCreateHabit }: Readonly<{ search: ReturnType<typeof useHabitSearch>; guided: boolean; onCreateHabit: (title: string) => void }>) {
  const t = useTranslations()
  const router = useRouter()
  const { isOnline } = useOffline()
  const [inputModality, setInputModality] = useState('keyboard')
  const [selectedValue, setSelectedValue] = useState('')
  useEffect(() => {
    if (inputModality !== 'keyboard') return
    const restorePointerHover = () => setInputModality('pointer')
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(restorePointerHover)
    })
    return () => cancelAnimationFrame(frame)
  }, [inputModality, selectedValue])
  const [createRefusal, setCreateRefusal] = useAccountScopedState(false)
  const entries = buildSearchEntries(search.data, search.query, null, search.today)
  const hasQuery = search.text.trim().length > 0
  const look = useFieldLook(hasQuery ? (hasSearchLine(search) ? 'line' : 'none') : 'block')
  function createHabit() {
    if (!isOnline) { setCreateRefusal(true); return }
    onCreateHabit(search.query)
  }
  function changeSelection(value: string) {
    setInputModality('keyboard')
    setSelectedValue(value)
  }
  const openHabit = (id: string) => router.push(`/habits/${id}`)
  return <Command shouldFilter={false} disablePointerSelection value={selectedValue} onValueChange={changeSelection} label={t('habits.search.question')} data-input-modality={inputModality} className={guided ? 'group/search flex flex-1 flex-col gap-4' : 'group/search flex flex-col gap-4'}>
    {guided
      ? <SearchQuestionBlock resting={!hasQuery} mascotRef={look.mascotRef} lookAt={look.lookAt}>
        <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={null} onBack={() => {}} searchMode plain onFieldFocus={look.onFieldFocus} onFieldBlur={look.onFieldBlur} />
      </SearchQuestionBlock>
      : <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={null} onBack={() => {}} searchMode />}
    {hasQuery && <CommandList label={t('habits.search.title')} aria-busy={search.busy} className="px-4 py-2">
      {guided
        ? <GuidedSearchOutcome search={search} entries={entries} mascotRef={look.mascotRef} lookAt={look.lookAt} onOpen={openHabit} onCreate={createHabit} createRefusal={!isOnline && createRefusal} />
        : <CurrentSearchOutcome search={search} entries={entries} onOpen={openHabit} onCreate={createHabit} createRefusal={!isOnline && createRefusal} />}
      <div className="flex gap-3"><ActionRow>
        {search.page > 1 && <IconButton label={t('habits.search.previous')} disabled={search.busy} onClick={() => search.setPage(search.page - 1)}><ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        {(search.data?.totalPages ?? 0) > search.page && <IconButton label={t('habits.search.next')} disabled={search.busy} onClick={() => search.setPage(search.page + 1)}><ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      </ActionRow></div>
    </CommandList>}
  </Command>
}

function CurrentSearchOutcome({ search, entries, onOpen, onCreate, createRefusal }: Readonly<{
  search: ReturnType<typeof useHabitSearch>; entries: ReturnType<typeof buildSearchEntries>
  onOpen: (id: string) => void; onCreate: () => void; createRefusal: boolean
}>) {
  const t = useTranslations()
  return <>
    {search.showLoading && <Searching />}
    {search.isError && <InlineLoadError message={t('habits.search.loadError')} onRetry={() => void search.refetch()} />}
    {!search.busy && !search.isError && (entries.length > 0
      ? <SearchResults today={search.today} totalCount={search.data?.totalCount ?? 0} sections={buildSearchSections(entries)} query={search.query} onOpen={onOpen} />
      : <SearchEmpty query={search.query} onCreate={onCreate} createRefusal={createRefusal} />)}
  </>
}
