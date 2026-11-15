import type { ReactNode, RefObject } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Trans, useTranslation } from 'react-i18next'
import type { OrbitLookTarget } from '@orbit/shared/contracts/brand'
import { SPACING } from '@orbit/shared/theme'
import { CommandGroups } from '@/components/command/command-groups'
import { ActionRow } from '@/components/ui/action-row'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { SearchOrbitLine } from './search-question-block'
import { SearchEmpty, Searching, SearchResult } from './search-results'
import type { SearchScreenModel } from './use-search-screen'

interface OrbitLineProps {
  mascotRef: RefObject<View | null>
  lookAt: OrbitLookTarget | null
}

/** False in the short wait before the search shows its status. The Orbit line then has no job, so it is absent. */
export function hasSearchLine(search: Pick<SearchScreenModel['search'], 'busy' | 'showLoading' | 'isError'>): boolean {
  return !search.busy || search.showLoading || search.isError
}

function useTokens() {
  const { currentScheme, currentTheme } = useAppTheme()
  return createTokensV2(currentScheme, currentTheme)
}

function SearchPagination({ search }: Readonly<{ search: SearchScreenModel['search'] }>) {
  const { t } = useTranslation()
  return <View style={styles.pagination}><ActionRow>
    {search.page > 1 && <IconButton label={t('habits.search.previous')} disabled={search.busy} onClick={() => search.setPage(search.page - 1)}><ChevronLeft size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
    {(search.data?.totalPages ?? 0) > search.page && <IconButton label={t('habits.search.next')} disabled={search.busy} onClick={() => search.setPage(search.page + 1)}><ChevronRight size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
  </ActionRow></View>
}

/** The loading and the load error rows of the current surface, and of the guided surface while no query is typed. */
function SearchProgress({ search }: Readonly<{ search: SearchScreenModel['search'] }>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  return <>
    {search.showLoading && (search.text.trim() ? <Searching /> : <><Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg3 }]}>{t('command.groups.search')}</Text>{[0, 1, 2].map((index) => <Skeleton key={index} variant="habit-row" label={t('habits.search.searching')} />)}</>)}
    {search.isError && <InlineLoadError message={t('habits.search.loadError')} onRetry={() => void search.refetch()} />}
  </>
}

/**
 * Orbit at 48 beside one sentence: the status, the count, the miss or the load error. The sentence comes from the
 * result set the search already holds, so it starts no request of its own. A changed sentence is announced after a pause.
 */
function SearchOutcomeLine({ model, mascotRef, lookAt }: Readonly<{ model: SearchScreenModel } & OrbitLineProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const { search, entries } = model
  const settled = !search.busy && !search.isError
  const found = settled && entries.length > 0
  const miss = settled && entries.length === 0
  const count = t('habits.search.line.count', { count: search.data?.totalCount ?? 0 })
  const spoken = found ? count : miss ? t('habits.search.emptyTitle', { query: search.query }).replace(/<\/?queryText>/g, '') : null
  const announcement = useFlowAnnouncement(spoken, 'search')
  let line: ReactNode = null
  if (search.showLoading) line = <Searching />
  else if (search.isError) line = <InlineLoadError message={t('habits.search.loadError')} onRetry={() => void search.refetch()} />
  else if (found) line = <Text testID="search-line-count" style={[styles.line, { color: tokens.fg2 }]}>{count}</Text>
  else if (miss) line = <Text testID="search-line-miss" style={[styles.line, { color: tokens.fg2 }]}><Trans i18nKey="habits.search.emptyTitle" values={{ query: search.query }} components={{ queryText: <Text /> }} /></Text>
  return <>
    {hasSearchLine(search) ? <SearchOrbitLine mascotRef={mascotRef} lookAt={miss || search.isError ? null : lookAt}>{line}</SearchOrbitLine> : null}
    <Text testID="search-line-status" accessibilityLiveRegion="polite" style={styles.status}>{announcement}</Text>
  </>
}

/** The rows under the search field. `mascotRef` is present on the guided surface: with a typed query the Orbit line holds the outcome. */
export function SearchList({ model, mascotRef, lookAt = null }: Readonly<{ model: SearchScreenModel } & Partial<OrbitLineProps>>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const { search, commandPage, entries, sections, commands, hideCreate } = model
  const lineHoldsOutcome = mascotRef !== undefined && commandPage === null && search.text.trim().length > 0
  return <>
    {mascotRef !== undefined && lineHoldsOutcome ? <SearchOutcomeLine model={model} mascotRef={mascotRef} lookAt={lookAt} /> : <SearchProgress search={search} />}
    {!search.busy && !search.isError && <>
      {entries.length > 0 && !lineHoldsOutcome && (search.query && !commandPage
        ? <Text style={[styles.count, { color: tokens.fg3 }]}>{t('habits.search.count', { count: search.data?.totalCount ?? 0 })}</Text>
        : <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg3 }]}>{t('command.groups.search')}</Text>)}
      {sections.map((section) => <View key={section.id} style={styles.section}>
        {section.id === 'completed' && <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg3 }]}>{t(section.headingKey)}</Text>}
        {section.entries.map(({ habit }) => <SearchResult key={habit.id} today={search.today} habit={habit} disabled={model.actionPending} query={search.query} onOpen={() => model.selectHabit(habit.id)} actionLabel={commandPage ? habit.title : undefined} />)}
      </View>)}
      {entries.length === 0 && (commandPage || !search.query) && commands.length === 0 && <Text style={{ color: tokens.fg3 }}>{t('command.empty')}</Text>}
      {entries.length === 0 && search.query.length > 0 && commandPage === null && <SearchEmpty query={search.query} onCreate={() => model.createHabit(search.query)} showTitle={!lineHoldsOutcome} />}
    </>}
    {!commandPage && <CommandGroups hideCreate={hideCreate} query={search.text} onSelect={model.selectCommand} />}
    <SearchPagination search={search} />
  </>
}

const styles = StyleSheet.create({
  count: { fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: SPACING.s4 },
  heading: { fontFamily: 'GeistMono_400Regular', fontSize: 12, textTransform: 'uppercase', padding: SPACING.s12 },
  section: { gap: 8, paddingBottom: SPACING.s8 },
  pagination: { flexDirection: 'row', gap: 12 },
  line: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4 },
  status: { position: 'absolute', width: 1, height: 1, opacity: 0 },
})
