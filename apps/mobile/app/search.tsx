import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { buildCommandHabitList, searchCommands, type SearchCommandId, type SearchCommandPage } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/pill-button'
import { Search } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { SearchEmpty, Searching, SearchResult } from '@/components/search/search-results'
import { CommandGroups } from '@/components/command/command-groups'
import { useOverlayBack } from '@/hooks/use-overlay-back'
import { useHabitSearch } from '@/hooks/use-habit-search'
import { useAppToast } from '@/hooks/use-app-toast'
import { useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export default function SearchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const search = useHabitSearch()
  const [commandPage, setCommandPage] = useState<SearchCommandPage>(null)
  const [createTitle, setCreateTitle] = useState<string | null>(null)
  const { showError } = useAppToast()
  const onActionError = () => showError(t('errors.updateHabit'))
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const habits = search.data ? (search.query && !commandPage ? search.data.topLevelHabits : buildCommandHabitList(search.data, search.query).map(({ habit }) => habit)) : []
  const hideCreate = !!search.query && habits.length === 0 && !search.busy
  const commands = searchCommands(search.text, commandPage, t).filter((command) => !hideCreate || command.id !== 'create')
  function back() {
    if (commandPage) { setCommandPage(null); search.changeText('') }
    else router.back()
  }
  useOverlayBack(commandPage !== null, () => { setCommandPage(null); search.changeText('') })
  function selectCommand(id: SearchCommandId) {
    if (id === 'create') setCreateTitle('')
    else if (id === 'log' || id === 'skip') { setCommandPage(id); search.changeText('') }
    else router.push(id === 'today' ? '/' : `/${id}`)
  }
  function selectHabit(id: string) {
    if (logHabit.isPending || skipHabit.isPending) return
    if (commandPage === 'log') logHabit.mutate({ habitId: id, intent: 'log' }, { onSuccess: back, onError: onActionError })
    else if (commandPage === 'skip') skipHabit.mutate({ habitId: id }, { onSuccess: back, onError: onActionError })
    else router.push(`/habits/${id}`)
  }
  return <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
    <AppBar title={t('habits.search.title')} onBack={back} backLabel={t('common.back')} />
    <View style={styles.field}>
      {commandPage && <Text style={[styles.chip, { color: tokens.fg2, backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}>{t(commandPage === 'log' ? 'command.page.log' : 'command.page.skip')}</Text>}
      <View style={styles.input}><Input label={t('habits.search.title')} placeholder={t('command.placeholder')} value={search.text} onChange={search.changeText} trailing={<Search size={20} color={tokens.fg3} />} /></View>
    </View>
    <ScrollView role="list" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} accessibilityState={{ busy: search.busy }}>
      {search.showLoading && <><Searching /><Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg4 }]}>{t('command.groups.search')}</Text>{[0, 1, 2].map((index) => <Skeleton key={index} variant="habit-row" label={t('habits.search.searching')} />)}</>}
      {search.isError && <View accessibilityRole="alert"><Text style={{ color: tokens.fg3 }}>{t('habits.search.loadError')}</Text><Button size="sm" variant="ghost" onClick={() => void search.refetch()}>{t('common.retry')}</Button></View>}
      {!search.busy && !search.isError && <>
        {habits.length > 0 && (search.query && !commandPage
          ? <Text style={[styles.count, { color: tokens.fg4 }]}>{t('habits.search.count', { count: search.data?.totalCount ?? 0 })}</Text>
          : <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg4 }]}>{t('command.groups.search')}</Text>)}
        {habits.map((habit) => <SearchResult key={habit.id} habit={habit} disabled={logHabit.isPending || skipHabit.isPending} query={search.query} onOpen={() => selectHabit(habit.id)} actionLabel={commandPage ? habit.title : undefined} />)}
        {habits.length === 0 && (commandPage || !search.query) && commands.length === 0 && <Text style={{ color: tokens.fg3 }}>{t('command.empty')}</Text>}
        {habits.length === 0 && search.query && !commandPage && <SearchEmpty query={search.query} onCreate={() => setCreateTitle(search.query)} />}
      </>}
      {!commandPage && <CommandGroups hideCreate={hideCreate} query={search.text} onSelect={selectCommand} />}
      <View style={styles.pagination}>
        {search.page > 1 && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page - 1)}>{t('habits.search.previous')}</Button>}
        {(search.data?.totalPages ?? 0) > search.page && <Button size="sm" variant="ghost" disabled={search.busy} onClick={() => search.setPage(search.page + 1)}>{t('habits.search.next')}</Button>}
      </View>
    </ScrollView>
    <CreateHabitModal open={createTitle !== null} initialTitle={createTitle ?? ''} onClose={() => setCreateTitle(null)} />
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, field: { padding: 16, gap: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, minWidth: 0 },
  list: { padding: 16, gap: 8, minHeight: 400 }, count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: 4 },
  heading: { fontFamily: 'GeistMono_400Regular', fontSize: 12, textTransform: 'uppercase', padding: 12 },
  chip: { padding: 8, borderRadius: radius.sm, borderWidth: 1, fontFamily: 'Geist_500Medium', fontSize: 12 }, pagination: { flexDirection: 'row', gap: 12 },
})
