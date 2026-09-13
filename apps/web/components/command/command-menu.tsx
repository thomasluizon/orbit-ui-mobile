"use client"

import { useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command, CommandEmpty, CommandGroup, CommandList } from 'cmdk'
import { buildSearchEntries, type CommandHabitEntry, type SearchCommandId, type SearchCommandPage } from '@orbit/shared/utils'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { SearchEmpty, SearchResults, Searching } from '@/components/search/search-results'
import { Button } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { CommandHabitItems } from './command-habit-items'
import { CommandGroups } from './command-groups'
import { CommandHabitSkeleton, CommandKeyHint, CommandSearchField, GROUP_CLASS } from './command-menu-chrome'
import type { CommandNavigationItem } from './command-palette'

interface CommandMenuProps {
  navItems: readonly CommandNavigationItem[]
  resultsMode?: boolean
  onCreateHabit: (title?: string) => void
  onClose: () => void
}

export function CommandMenu({ navItems, onCreateHabit, onClose, resultsMode = false }: Readonly<CommandMenuProps>) {
  const t = useTranslations()
  const router = useRouter()
  const search = useHabitSearch()
  const [page, setPage] = useState<SearchCommandPage>(null)
  const { showError } = useAppToast()
  const onActionError = () => showError(t('errors.updateHabit'))
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const entries = buildSearchEntries(search.data, search.query, page)
  const pageLabel = page === 'log' ? t('command.page.log') : t('command.page.skip')
  const showResults = resultsMode && page === null && !!search.query
  function run(action: () => void) { action(); onClose() }
  function back() { setPage(null); search.changeText('') }
  function chooseCommand(id: SearchCommandId) {
    if (id === 'create') run(onCreateHabit)
    else if (id === 'log' || id === 'skip') { setPage(id); search.changeText('') }
  }
  function chooseHabit(id: string) {
    if (logHabit.isPending || skipHabit.isPending) return
    if (page === 'log') logHabit.mutate({ habitId: id }, { onSuccess: () => { back(); onClose() }, onError: onActionError })
    else if (page === 'skip') skipHabit.mutate({ habitId: id }, { onSuccess: () => { back(); onClose() }, onError: onActionError })
    else run(() => router.push(`/habits/${id}`))
  }
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (page && (event.key === 'Escape' || (event.key === 'Backspace' && search.text === ''))) {
      event.preventDefault(); event.stopPropagation(); back()
    }
  }
  return <Command shouldFilter={false} label={t('command.title')} className="flex flex-col overflow-hidden" onKeyDown={handleKeyDown}>
    <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={page === null ? null : pageLabel} onBack={back} />
    <CommandList label={t('command.title')} aria-busy={search.busy} className="h-[min(60vh,400px)] overflow-y-auto overflow-x-hidden overscroll-contain p-2">
      {search.isSuccess && !search.busy && !showResults && <CommandEmpty className="p-3 text-[length:var(--fs-sm)] text-[var(--fg-3)]">{t('command.empty')}</CommandEmpty>}
      {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
      {search.isError && <div role="alert"><p>{t('habits.search.loadError')}</p><Button size="sm" variant="ghost" onClick={() => void search.refetch()}>{t('common.retry')}</Button></div>}
      {search.showLoading && <><Searching /><CommandHabitSkeleton heading={t('command.groups.search')} /></>}
      {!search.busy && !search.isError && <CommandResults showResults={showResults} entries={entries} totalCount={search.data?.totalCount ?? 0} query={search.query} onOpen={chooseHabit} onCreate={() => onCreateHabit(search.query)} disabled={logHabit.isPending || skipHabit.isPending} />}
      {page === null && <CommandGroups hideCreate={showResults && entries.length === 0 && !search.busy} query={search.text} navItems={navItems} onSelect={chooseCommand} onNavigate={run} />}
      <div className="flex gap-3">
        {search.page > 1 && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page - 1)}>{t('habits.search.previous')}</Button>}
        {(search.data?.totalPages ?? 0) > search.page && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page + 1)}>{t('habits.search.next')}</Button>}
      </div>
    </CommandList>
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 shadow-[inset_0_1px_0_var(--hairline)]">
      <CommandKeyHint keys={['↑', '↓']} label={t('command.hints.navigate')} />
      <CommandKeyHint keys={['↵']} label={t('command.hints.select')} />
      <CommandKeyHint keys={['Esc']} label={t(page ? 'command.hints.back' : 'command.hints.close')} />
    </div>
  </Command>
}

function CommandResults({ showResults, entries, totalCount, query, onOpen, onCreate, disabled }: Readonly<{
  showResults: boolean; entries: CommandHabitEntry[]; totalCount: number; query: string
  onOpen: (id: string) => void; onCreate: () => void; disabled: boolean
}>) {
  const t = useTranslations()
  if (showResults) return entries.length > 0
    ? <SearchResults totalCount={totalCount} habits={entries.map(({ habit }) => habit)} query={query} onOpen={onOpen} />
    : <SearchEmpty query={query} onCreate={onCreate} />
  if (entries.length === 0) return null
  return <CommandGroup heading={t('command.groups.search')} className={GROUP_CLASS} data-command-group="habits"><CommandHabitItems disabled={disabled} entries={entries} query={query} onSelectHabit={(habit) => onOpen(habit.id)} /></CommandGroup>
}
