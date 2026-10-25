'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useEffect, useState } from 'react'
import { ActionRow } from '@/components/ui/action-row'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command, CommandList } from 'cmdk'
import { buildHabitCreateHref, buildSearchEntries } from '@orbit/shared/utils'
import { PageHeader } from '@/components/ui/page-header'
import { CommandSearchField } from '@/components/command/command-menu-chrome'
import { SearchEmpty, SearchResults, Searching } from '@/components/search/search-results'

import { useHabitSearch } from '@/hooks/use-habit-search'
import { useOffline } from '@/hooks/use-offline'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useAccountScopedState } from '@/hooks/use-session-reset'

export default function SearchPage() {
  const t = useTranslations()
  const router = useRouter()
  const search = useHabitSearch()
  const createHabit = (title = '') => router.push(buildHabitCreateHref({ title, from: '/search' }))
  useOverlayEscape({ open: true, onDismiss: () => router.back(), restoreFocus: false })
  return <>
    <PageHeader title={t('habits.search.title')} onBack={() => router.back()} backLabel={t('common.back')} />
    <div className="mx-auto w-full max-w-[620px]">
      <HabitSearch search={search} onCreateHabit={createHabit} />
    </div>
  </>
}

function HabitSearch({ search, onCreateHabit }: Readonly<{ search: ReturnType<typeof useHabitSearch>; onCreateHabit: (title: string) => void }>) {
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
  const entries = buildSearchEntries(search.data, search.query, null)
  const hasQuery = search.text.trim().length > 0
  function createHabit() {
    if (!isOnline) { setCreateRefusal(true); return }
    onCreateHabit(search.query)
  }
  function changeSelection(value: string) {
    setInputModality('keyboard')
    setSelectedValue(value)
  }
  return <Command shouldFilter={false} disablePointerSelection value={selectedValue} onValueChange={changeSelection} label={t('habits.search.title')} data-input-modality={inputModality} className="group/search flex flex-col gap-4">
    <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={null} onBack={() => {}} searchMode />
    {hasQuery && <CommandList label={t('habits.search.title')} aria-busy={search.busy} className="px-4 py-2">
      {search.showLoading && <Searching />}
      {search.isError && <div role="alert"><p>{t('habits.search.loadError')}</p><IconButton label={t('common.retry')} onClick={() => void search.refetch()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton></div>}
      {!search.busy && !search.isError && (entries.length > 0
        ? <SearchResults totalCount={search.data?.totalCount ?? 0} habits={entries.map(({ habit }) => habit)} query={search.query} onOpen={(id) => router.push(`/habits/${id}`)} />
        : <SearchEmpty query={search.query} onCreate={createHabit} createRefusal={!isOnline && createRefusal} />)}
      <div className="flex gap-3"><ActionRow>
        {search.page > 1 && <IconButton label={t('habits.search.previous')} disabled={search.busy} onClick={() => search.setPage(search.page - 1)}><ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        {(search.data?.totalPages ?? 0) > search.page && <IconButton label={t('habits.search.next')} disabled={search.busy} onClick={() => search.setPage(search.page + 1)}><ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      </ActionRow></div>
    </CommandList>}
  </Command>
}
