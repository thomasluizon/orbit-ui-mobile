'use client'

import { ActionRow } from '@/components/ui/action-row'

import { type KeyboardEvent, useEffect, useState } from 'react'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command, CommandEmpty, CommandGroup, CommandList } from 'cmdk'
import { buildSearchEntries, searchCommands, type SearchCommandId, type SearchCommandPage } from '@orbit/shared/utils'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { Searching } from '@/components/search/search-results'
import { Button } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useOffline } from '@/hooks/use-offline'
import { useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { CommandHabitItems, commandHabitValue } from './command-habit-items'
import { CommandGroups } from './command-groups'
import { CommandHabitSkeleton, CommandKeyHint, CommandSearchField, GROUP_CLASS } from './command-menu-chrome'
import type { CommandNavigationItem } from './command-palette'

interface CommandMenuProps {
  navItems: readonly CommandNavigationItem[]
  onCreateHabit: (title?: string) => void
  onClose: () => void
}

function useCreateRefusal(onCreateHabit: (title?: string) => void, onClose: () => void) {
  const [createRefusal, setCreateRefusal] = useAccountScopedState(false)
  const { isOnline } = useOffline()
  useEffect(() => { if (isOnline) setCreateRefusal(false) }, [isOnline, setCreateRefusal])
  function createHabit(title?: string) {
    if (!isOnline) { setCreateRefusal(true); return }
    onCreateHabit(title)
    onClose()
  }
  return { createRefusal: !isOnline && createRefusal, createHabit }
}

function HabitSearchLoading({ show, text, heading }: Readonly<{ show: boolean; text: string; heading: string }>) {
  if (!show) return null
  return text.trim() ? <Searching /> : <CommandHabitSkeleton heading={heading} />
}

export function CommandMenu({ navItems, onCreateHabit, onClose }: Readonly<CommandMenuProps>) {
  const search = useHabitSearch()
  const t = useTranslations()
  const router = useRouter()
  /**
   * The palette outlives an account replacement, because `shell-store.paletteOpen` holds it
   * open and `#600` leaves that store alone. Its rows are already the next account's, and so
   * is the typed text, which `use-habit-search.ts:16-18` scopes.
   */
  const [page, setPage] = useAccountScopedState<SearchCommandPage>(null)
  const { createRefusal, createHabit } = useCreateRefusal(onCreateHabit, onClose)
  const { showError } = useAppToast()
  const onActionError = () => showError(t('errors.updateHabit'))
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const entries = buildSearchEntries(search.data, search.query, page)
  const pageLabel = page === 'log' ? t('command.page.log') : t('command.page.skip')
  const visibleEntries = !search.busy && !search.isError ? entries : []
  const firstCommand = page === null
    ? searchCommands(search.text, null, t).filter((command) => command.group !== 'destinations')[0]
    : undefined
  const firstDestination = navItems.find((item) => item.label.toLocaleLowerCase().includes(search.text.trim().toLocaleLowerCase()))
  const firstValue = visibleEntries.length > 0
    ? commandHabitValue(visibleEntries[0]!)
    : firstCommand?.id ?? firstDestination?.id ?? ''
  const [selection, setSelection] = useState({ first: firstValue, selected: firstValue })
  if (selection.first !== firstValue) setSelection({ first: firstValue, selected: firstValue })
  const selectedValue = selection.first === firstValue ? selection.selected : firstValue
  function run(action: () => void) { action(); onClose() }
  function back() { setPage(null); search.changeText('') }
  function chooseCommand(id: SearchCommandId) {
    if (id === 'create') createHabit()
    else if (id === 'log' || id === 'skip') { setPage(id); search.changeText('') }
  }
  function chooseHabit(id: string) {
    if (logHabit.isPending || skipHabit.isPending) return
    if (page === 'log') logHabit.mutate({ habitId: id, intent: 'log' }, { onSuccess: () => { back(); onClose() } })
    else if (page === 'skip') skipHabit.mutate({ habitId: id }, { onSuccess: () => { back(); onClose() }, onError: onActionError })
    else run(() => requestHabitCreateNavigation(() => router.push(`/habits/${id}`)))
  }
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (page && (event.key === 'Escape' || (event.key === 'Backspace' && search.text === ''))) {
      event.preventDefault(); event.stopPropagation(); back()
    }
  }
  return <Command shouldFilter={false} value={selectedValue} onValueChange={(selected) => setSelection({ first: firstValue, selected })} label={t('command.placeholder')} className="flex min-h-0 flex-1 flex-col overflow-hidden" onKeyDown={handleKeyDown}>
    <CommandSearchField search={search.text} setSearch={search.changeText} activePageLabel={page === null ? null : pageLabel} onBack={back} />
    <CommandList label={t('command.title')} aria-busy={search.busy} className="h-[min(60vh,400px)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2">
      {search.isSuccess && !search.busy && <CommandEmpty className="p-3 text-[length:var(--fs-sm)] text-[var(--fg-3)]">{t('command.empty')}</CommandEmpty>}
      {search.isError && <div role="alert"><p>{t('habits.search.loadError')}</p><Button size="sm" variant="ghost" onClick={() => void search.refetch()}>{t('common.retry')}</Button></div>}
      <HabitSearchLoading show={search.showLoading} text={search.text} heading={t('command.groups.search')} />
      {!search.busy && !search.isError && entries.length > 0 && <CommandGroup heading={t('command.groups.search')} className={GROUP_CLASS} data-command-group="habits"><CommandHabitItems disabled={logHabit.isPending || skipHabit.isPending} entries={entries} query={search.query} onSelectHabit={(habit) => chooseHabit(habit.id)} /></CommandGroup>}
      {page === null && <CommandGroups query={search.text} navItems={navItems} onSelect={chooseCommand} onNavigate={run} createRefusal={createRefusal} />}
      <div className="flex gap-3"><ActionRow>
        {search.page > 1 && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page - 1)}>{t('habits.search.previous')}</Button>}
        {(search.data?.totalPages ?? 0) > search.page && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page + 1)}>{t('habits.search.next')}</Button>}
      </ActionRow></div>
    </CommandList>
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 shadow-[inset_0_1px_0_var(--hairline)]">
      <CommandKeyHint keys={['↑↓']} label={t('command.hints.navigate')} />
      <CommandKeyHint keys={['↵']} label={t('command.hints.select')} />
      <CommandKeyHint keys={['esc']} label={t(page ? 'command.hints.back' : 'command.hints.close')} />
    </div>
  </Command>
}
