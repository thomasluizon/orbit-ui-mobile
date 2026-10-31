import { IconButton } from '@/components/ui/icon-button'
import { SPACING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'

import { ActionRow } from '@/components/ui/action-row'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { buildHabitCreateHref, buildSearchEntries, searchCommands, type SearchCommandId, type SearchCommandPage } from '@orbit/shared/utils'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { PageHeader } from '@/components/ui/page-header'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Input } from '@/components/ui/input'

import { Search, RefreshCw, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
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
  const clearance = useShellScrollerClearance()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const search = useHabitSearch()
  const [commandPage, setCommandPage] = useState<SearchCommandPage>(null)
  const createHabit = (title = '') => router.push(buildHabitCreateHref({ title, from: '/search' }))
  const { showError } = useAppToast()
  const onActionError = () => showError(t('errors.updateHabit'))
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const habits = buildSearchEntries(search.data, search.query, commandPage).map(({ habit }) => habit)
  const hideCreate = !!search.query && habits.length === 0 && !search.busy
  const commands = searchCommands(search.text, commandPage, t).filter((command) => !hideCreate || command.id !== 'create')
  function back() {
    if (commandPage) { setCommandPage(null); search.changeText('') }
    else router.back()
  }
  useOverlayBack(commandPage !== null, () => { setCommandPage(null); search.changeText('') })
  function selectCommand(id: SearchCommandId) {
    if (id === 'create') createHabit()
    else if (id === 'log' || id === 'skip') { setCommandPage(id); search.changeText('') }
    else router.push(id === 'today' ? '/' : `/${id}`)
  }
  function selectHabit(id: string) {
    if (logHabit.isPending || skipHabit.isPending) return
    if (commandPage === 'log') logHabit.mutate({ habitId: id, intent: 'log' }, { onSuccess: back })
    else if (commandPage === 'skip') skipHabit.mutate({ habitId: id }, { onSuccess: back, onError: onActionError })
    else router.push(`/habits/${id}`)
  }
  return <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
    <PageHeader title={t('habits.search.title')} onBack={back} backLabel={t('common.back')} />
    <KeyboardAwareSheetScrollView style={{ flexGrow: 0 }} contentContainerStyle={[styles.field, styles.columnInset]}>
      {commandPage !== null && <Text style={[styles.chip, { color: tokens.fg2, backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}>{t(commandPage === 'log' ? 'command.page.log' : 'command.page.skip')}</Text>}
      <View style={styles.input}><Input label={t('habits.search.title')} placeholder={t('habits.moveParent.searchPlaceholder')} value={search.text} onChange={search.changeText} trailing={<Search size={20} color={tokens.fg3} />} /></View>
    </KeyboardAwareSheetScrollView>
    <ScrollView role="list" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.list, styles.columnInset, { paddingBottom: clearance }]} accessibilityState={{ busy: search.busy }}>
      {search.showLoading && (search.text.trim() ? <Searching /> : <><Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg3 }]}>{t('command.groups.search')}</Text>{[0, 1, 2].map((index) => <Skeleton key={index} variant="habit-row" label={t('habits.search.searching')} />)}</>)}
      {search.isError && <View accessibilityRole="alert"><Text style={{ color: tokens.fg3 }}>{t('habits.search.loadError')}</Text><IconButton label={t('common.retry')} onClick={() => void search.refetch()}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton></View>}
      {!search.busy && !search.isError && <>
        {habits.length > 0 && (search.query && !commandPage
          ? <Text style={[styles.count, { color: tokens.fg3 }]}>{t('habits.search.count', { count: search.data?.totalCount ?? 0 })}</Text>
          : <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg3 }]}>{t('command.groups.search')}</Text>)}
        {habits.map((habit) => <SearchResult key={habit.id} habit={habit} disabled={logHabit.isPending || skipHabit.isPending} query={search.query} onOpen={() => selectHabit(habit.id)} actionLabel={commandPage ? habit.title : undefined} />)}
        {habits.length === 0 && (commandPage || !search.query) && commands.length === 0 && <Text style={{ color: tokens.fg3 }}>{t('command.empty')}</Text>}
        {habits.length === 0 && search.query.length > 0 && commandPage === null && <SearchEmpty query={search.query} onCreate={() => createHabit(search.query)} />}
      </>}
      {!commandPage && <CommandGroups hideCreate={hideCreate} query={search.text} onSelect={selectCommand} />}
      <View style={styles.pagination}><ActionRow>
        {search.page > 1 && <IconButton label={t('habits.search.previous')} disabled={search.busy} onClick={() => search.setPage(search.page - 1)}><ChevronLeft size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
        {(search.data?.totalPages ?? 0) > search.page && <IconButton label={t('habits.search.next')} disabled={search.busy} onClick={() => search.setPage(search.page + 1)}><ChevronRight size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
      </ActionRow></View>
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH }, columnInset: { alignSelf: 'center', width: '100%', maxWidth: 620, paddingHorizontal: SPACING.s16 }, field: { paddingVertical: SPACING.s16, gap: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, minWidth: 0 },
  list: { paddingTop: SPACING.s16, gap: 8, minHeight: 400 }, count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: SPACING.s4 },
  heading: { fontFamily: 'GeistMono_400Regular', fontSize: 12, textTransform: 'uppercase', padding: SPACING.s12 },
  chip: { padding: SPACING.s8, borderRadius: radius.sm, borderWidth: 1, fontFamily: 'Geist_500Medium', fontSize: 12 }, pagination: { flexDirection: 'row', gap: 12 },
})
