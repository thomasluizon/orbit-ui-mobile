import { IconButton } from '@/components/ui/icon-button'
import { X, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { calendarEntryOutcome } from '@orbit/shared/utils'
import { Sheet } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'

import { ActionRow } from '@/components/ui/action-row'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function CalendarEntryDetails({ entries, title, displayTime, onClose }: Readonly<{
  entries: readonly CalendarDayEntry[]
  title: string
  displayTime: (time: string) => string
  onClose: () => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const matching = entries.filter((entry) => entry.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const visible = matching.slice(page * 20, (page + 1) * 20)

  return <Sheet title={title} onClose={onClose}>
    <View style={styles.content}>
      {entries.length >= 8 ? <Input label={t('calendar.entrySearch')} value={query} onChange={(value) => { setQuery(value); setPage(0) }} autoComplete="off" /> : null}
      {visible.map((entry) => <View key={entry.habitId} style={styles.entry}>
        <PersonalText expanded selectable style={[styles.title, { color: tokens.fg1 }]}>{entry.title}</PersonalText>
        <Text style={[styles.meta, { color: tokens.fg2 }]}>{t('calendar.entryMeta', { time: entry.dueTime ? displayTime(entry.dueTime) : t('calendar.timeGrid.noSetTime'), status: t(calendarEntryOutcome(entry).labelKey) })}</Text>
      </View>)}
      {matching.length === 0 ? <View style={styles.searchEmpty}><Text style={[styles.empty, { color: tokens.fg2 }]}>{t('calendar.entrySearchEmpty', { query: query.trim() })}</Text><IconButton label={t('calendar.dayDetail.clearEventSearch')} onClick={() => { setQuery(''); setPage(0) }}><X size={20} strokeWidth={1.5} accessible={false} /></IconButton></View> : null}
      {entries.length >= 8 ? <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: tokens.fg2 }]}>{t('calendar.showingCount', { shown: visible.length, total: matching.length })}</Text> : null}
      {matching.length > 20 ? <ActionRow>
        <IconButton label={t('common.previous')} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={20} strokeWidth={1.5} accessible={false} /></IconButton>
        <IconButton label={t('common.next')} disabled={(page + 1) * 20 >= matching.length} onClick={() => setPage(page + 1)}><ChevronRight size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </ActionRow> : null}
    </View>
  </Sheet>
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  searchEmpty: { gap: 12, alignItems: 'flex-start' },
  entry: { gap: 4 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
  empty: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24.8 },
})
