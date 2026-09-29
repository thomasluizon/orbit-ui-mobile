'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Command, CommandList } from 'cmdk'
import { buildSearchEntries } from '@orbit/shared/utils'
import { PageHeader } from '@/components/ui/page-header'
import { CommandMenu } from '@/components/command/command-menu'
import { CommandSearchField } from '@/components/command/command-menu-chrome'
import { SearchEmpty, SearchResults, Searching } from '@/components/search/search-results'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { Button } from '@/components/ui/pill-button'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useOffline } from '@/hooks/use-offline'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useAccountScopedState } from '@/hooks/use-session-reset'

export default function SearchPage() {
  const t = useTranslations()
  const router = useRouter()
  const wide = useIsWideDesktop()
  const [createTitle, setCreateTitle] = useAccountScopedState<string | null>(null)
  useOverlayEscape({ open: true, onDismiss: () => router.back(), restoreFocus: false })
  const navItems = [
    { id: 'hoje', label: t('nav.today'), icon: Home, onSelect: () => router.push('/') },
    { id: 'calendario', label: t('nav.calendar'), icon: CalendarDays, onSelect: () => router.push('/calendar') },
    { id: 'progresso', label: t('nav.progress'), icon: ChartLine, onSelect: () => router.push('/progress') },
    { id: 'perfil', label: t('nav.profile'), icon: User, onSelect: () => router.push('/profile') },
  ] as const
  return <>
    <PageHeader title={t('habits.search.title')} onBack={() => router.back()} backLabel={t('common.back')} />
    <div className="max-w-[620px]">
      {wide
        ? <WideSearch onCreateHabit={setCreateTitle} />
        : <CommandMenu resultsMode navItems={navItems} onCreateHabit={(title = '') => setCreateTitle(title)} onClose={() => {}} />}
    </div>
    {createTitle !== null && <CreateHabitModal open initialTitle={createTitle} onOpenChange={(open) => { if (!open) setCreateTitle(null) }} />}
  </>
}

function WideSearch({ onCreateHabit }: Readonly<{ onCreateHabit: (title: string) => void }>) {
  const t = useTranslations()
  const router = useRouter()
  const search = useHabitSearch()
  const { isOnline } = useOffline()
  const [createRefusal, setCreateRefusal] = useState(false)
  const entries = buildSearchEntries(search.data, search.query, null)
  const hasQuery = search.text.trim().length > 0
  function createHabit() {
    if (!isOnline) { setCreateRefusal(true); return }
    onCreateHabit(search.query)
  }
  return <Command shouldFilter={false} label={t('habits.search.title')} className="flex flex-col gap-4">
    <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={null} onBack={() => {}} searchMode />
    {hasQuery && <CommandList label={t('habits.search.title')} aria-busy={search.busy} className="p-2">
      {search.showLoading && <Searching />}
      {search.isError && <div role="alert"><p>{t('habits.search.loadError')}</p><Button size="sm" variant="ghost" onClick={() => void search.refetch()}>{t('common.retry')}</Button></div>}
      {!search.busy && !search.isError && (entries.length > 0
        ? <SearchResults totalCount={search.data?.totalCount ?? 0} habits={entries.map(({ habit }) => habit)} query={search.query} onOpen={(id) => router.push(`/habits/${id}`)} />
        : <SearchEmpty query={search.query} onCreate={createHabit} createRefusal={!isOnline && createRefusal} />)}
      <div className="flex gap-3">
        {search.page > 1 && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page - 1)}>{t('habits.search.previous')}</Button>}
        {(search.data?.totalPages ?? 0) > search.page && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page + 1)}>{t('habits.search.next')}</Button>}
      </div>
    </CommandList>}
  </Command>
}
