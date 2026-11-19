import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { buildHabitCreateHref, buildSearchEntries, buildSearchSections, searchCommands, type SearchCommandId, type SearchCommandPage } from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useLogHabit, useSkipHabit } from '@/hooks/use-habit-logging'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { useOverlayBack } from '@/hooks/use-overlay-back'

/** The state and the actions of the search screen. The current frame and the guided frame render the same model, so both send the same requests. */
export function useSearchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const search = useHabitSearch()
  const [commandPage, setCommandPage] = useState<SearchCommandPage>(null)
  const createHabit = (title = '') => router.push(buildHabitCreateHref({ title, from: '/search' }))
  const { showError } = useAppToast()
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const entries = buildSearchEntries(search.data, search.query, commandPage, search.today)
  const hideCreate = !!search.query && entries.length === 0 && !search.busy
  const commands = searchCommands(search.text, commandPage, t).filter((command) => !hideCreate || command.id !== 'create')
  const leaveCommandPage = () => { setCommandPage(null); search.changeText('') }
  function back() {
    if (commandPage) leaveCommandPage()
    else router.back()
  }
  useOverlayBack(commandPage !== null, leaveCommandPage)
  function selectCommand(id: SearchCommandId) {
    if (id === 'create') createHabit()
    else if (id === 'log' || id === 'skip') { setCommandPage(id); search.changeText('') }
    else router.push(id === 'today' ? '/' : `/${id}`)
  }
  function selectHabit(id: string) {
    if (logHabit.isPending || skipHabit.isPending) return
    if (commandPage === 'log') logHabit.mutate({ habitId: id, intent: 'log' }, { onSuccess: back })
    else if (commandPage === 'skip') skipHabit.mutate({ habitId: id }, { onSuccess: back, onError: () => showError(t('errors.updateHabit')) })
    else router.push(`/habits/${id}`)
  }
  return {
    search, commandPage, entries, sections: buildSearchSections(entries), hideCreate, commands,
    actionPending: logHabit.isPending || skipHabit.isPending, back, createHabit, selectCommand, selectHabit,
  }
}

export type SearchScreenModel = ReturnType<typeof useSearchScreen>
