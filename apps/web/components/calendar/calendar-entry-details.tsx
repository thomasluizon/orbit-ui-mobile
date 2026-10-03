'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { calendarEntryOutcome } from '@orbit/shared/utils'
import { Sheet } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'

export function CalendarEntryDetails({ entries, title, displayTime, onClose }: Readonly<{
  entries: readonly CalendarDayEntry[]
  title: string
  displayTime: (time: string) => string
  onClose: () => void
}>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const matching = entries.filter((entry) => entry.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const visible = matching.slice(page * 20, (page + 1) * 20)

  return <Sheet title={title} onClose={onClose}>
    <div className="flex min-w-0 flex-col" style={{ gap: 24 }}>
      {entries.length >= 8 ? <Input label={t('calendar.entrySearch')} value={query} onChange={(value) => { setQuery(value); setPage(0) }} autoComplete="off" /> : null}
      {visible.map((entry) => <div key={entry.habitId} className="flex min-w-0 flex-col" style={{ gap: 4 }}>
        <p style={{ margin: 0, overflowWrap: 'anywhere', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 17, lineHeight: 1.4 }}>{entry.title}</p>
        <p style={{ margin: 0, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.4 }}>{t('calendar.entryMeta', { time: entry.dueTime ? displayTime(entry.dueTime) : t('calendar.timeGrid.noSetTime'), status: t(calendarEntryOutcome(entry).labelKey) })}</p>
      </div>)}
      {matching.length === 0 ? <p style={{ margin: 0, color: 'var(--fg-2)', fontSize: 16, lineHeight: 1.55 }}>{t('calendar.entrySearchEmpty')}</p> : null}
      {entries.length >= 8 ? <p style={{ margin: 0, color: 'var(--fg-2)', fontSize: 12, lineHeight: 1.4 }}>{t('calendar.showingCount', { shown: Math.min((page + 1) * 20, matching.length), total: matching.length })}</p> : null}
      {matching.length > 20 ? <ActionRow>
        <PillButton variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.previous')}</PillButton>
        <PillButton variant="ghost" disabled={(page + 1) * 20 >= matching.length} onClick={() => setPage(page + 1)}>{t('common.next')}</PillButton>
      </ActionRow> : null}
    </div>
  </Sheet>
}
