'use client'

import { ActionRow } from '@/components/ui/action-row'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command, CommandList } from 'cmdk'
import { buildHabitCreateHref, buildSearchEntries } from '@orbit/shared/utils'
import { PageHeader } from '@/components/ui/page-header'
import { CommandSearchField } from '@/components/command/command-menu-chrome'
import { SearchEmpty, SearchResults, Searching } from '@/components/search/search-results'
import { Button } from '@/components/ui/pill-button'
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
    <div className="max-w-[620px]">
      <HabitSearch search={search} onCreateHabit={createHabit} />
    </div>
  </>
}

function HabitSearch({ search, onCreateHabit }: Readonly<{ search: ReturnType<typeof useHabitSearch>; onCreateHabit: (title: string) => void }>) {
  const t = useTranslations()
  const router = useRouter()
  const { isOnline } = useOffline()
  const [createRefusal, setCreateRefusal] = useAccountScopedState(false)
  const entries = buildSearchEntries(search.data, search.query, null)
  const hasQuery = search.text.trim().length > 0
  function createHabit() {
    if (!isOnline) { setCreateRefusal(true); return }
    onCreateHabit(search.query)
  }
  return <Command shouldFilter={false} label={t('habits.search.title')} className="flex flex-col gap-4">
    <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={null} onBack={() => {}} searchMode />
    {hasQuery && <CommandList label={t('habits.search.title')} aria-busy={search.busy} className="px-4 py-2">
      {search.showLoading && <Searching />}
      {search.isError && <div role="alert"><p>{t('habits.search.loadError')}</p><Button size="sm" variant="ghost" onClick={() => void search.refetch()}>{t('common.retry')}</Button></div>}
      {!search.busy && !search.isError && (entries.length > 0
        ? <SearchResults totalCount={search.data?.totalCount ?? 0} habits={entries.map(({ habit }) => habit)} query={search.query} onOpen={(id) => router.push(`/habits/${id}`)} />
        : <SearchEmpty query={search.query} onCreate={createHabit} createRefusal={!isOnline && createRefusal} />)}
      <div className="flex gap-3"><ActionRow>
        {search.page > 1 && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page - 1)}>{t('habits.search.previous')}</Button>}
        {(search.data?.totalPages ?? 0) > search.page && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page + 1)}>{t('habits.search.next')}</Button>}
      </ActionRow></div>
    </CommandList>}
  </Command>
}
