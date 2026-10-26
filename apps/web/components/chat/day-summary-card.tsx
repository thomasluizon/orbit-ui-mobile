'use client'

import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { useRef, useState, type ReactNode } from 'react'
import { daySummaryLogControl } from '@orbit/shared/chat/day-summary-core'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { getAccountDay } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitBlockRow } from './habit-block-row'
import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslations } from 'next-intl'

function DaySummaryControl({ readOnly, disabled, label, onToggle, children }: Readonly<{
  readOnly: boolean
  disabled: boolean
  label: string
  onToggle: () => void
  children: ReactNode
}>) {
  if (readOnly) return <span className="grid size-[var(--touch-min)] place-items-center">{children}</span>
  return <button data-habit-row-control="check" type="button" disabled={disabled} aria-label={label} onClick={onToggle} className="grid size-[var(--touch-min)] place-items-center border-0 bg-transparent focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">{children}</button>
}

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  const occurrences = useHabits({ dateFrom: daySummary.date, dateTo: daySummary.date, includeGeneral: true, includeOverdue: true }, undefined, { completeDay: true })
  const logHabit = useLogHabit()
  const readScope = useReadActionScope()
  const pending = useRef(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const payloadRows = daySummary.rows ?? []
  const [shownCount, setShownCount] = useState(20)
  const visibleRows = payloadRows.slice(0, shownCount)
  const totalRows = daySummary.totalRows ?? payloadRows.length
  const missing = occurrences.data != null && visibleRows.some((item) => !occurrences.data.habitsById.has(item.id))
  const unavailable = missing || (daySummary.dateTo != null && daySummary.dateTo !== daySummary.date)
  const frameState = liveBlockState(occurrences, { acting: pendingId !== null, failed: failedId !== null, stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void occurrences.refetch() } })
  const toggle = (habitId: string) => {
    const control = daySummaryLogControl(occurrences.data?.habitsById.get(habitId), false, readScope ? { ...readScope, date: daySummary.date, today: getAccountDay(new Date(), readScope.timeZone) } : undefined)
    if (pending.current || unavailable || control.undoUnavailable || !control.writeAllowed) return
    pending.current = true
    setPendingId(habitId)
    setFailedId(null)
    logHabit.mutate({ habitId, intent: control.logged ? 'unlog' : 'log', date: daySummary.date }, {
      onError: () => setFailedId(habitId),
      onSettled: () => { pending.current = false; setPendingId(null) },
    })
  }
  const done = daySummary.done
  const completionRate = daySummary.completionRate ?? 0
  const rows = visibleRows.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const title = item.title
    const control = daySummaryLogControl(occurrence, item.status === 'overdue', readScope ? { ...readScope, date: daySummary.date, today: getAccountDay(new Date(), readScope.timeZone) } : undefined)
    const actionLabel = control.undoUnavailable ? `${title}: ${t(control.statusKey)}` : t(control.actionKey, { name: title })
    return <HabitBlockRow key={item.id} title={title} emoji={item.emoji} label={t('chat.habitList.open', { name: title })}
      onOpen={() => navigate(`/habits/${item.id}?date=${daySummary.date}`)} control={occurrence && !unavailable ? <DaySummaryControl readOnly={control.undoUnavailable || !control.writeAllowed} disabled={pendingId !== null || unavailable} label={actionLabel} onToggle={() => toggle(item.id)}><HabitCheck status={control.status} label={t(control.statusKey)} /></DaySummaryControl> : undefined} />
  })
  return <div className="w-full">
    <BlockFrame {...frameState} title={t(daySummary.read ? 'chat.readBlock.dayTitle' : 'chat.daySummary.title')} count={null} items={[
      { id: 'overdue', wrapLabel: true, label: t('chat.daySummary.overdue'), control: <span className="tabular-nums">{daySummary.overdueCount}</span> },
      ...(!daySummary.read ? [{ id: 'streak', wrapLabel: true, label: t('chat.daySummary.streak'), control: <span className="tabular-nums">{daySummary.currentStreak}</span> }] : []),
    ]}
      body={<><div className="flex flex-col gap-2">{rows}</div>{daySummary.due > 0 && daySummary.completionRate != null ? <ProgressRing value={completionRate} label={t(daySummary.read ? 'chat.daySummary.doneOfDue' : 'chat.daySummary.ring', { done, due: daySummary.due })} /> : null}<p className="text-sm text-[var(--fg-3)]">{daySummary.due === 0 ? t(daySummary.read ? 'chat.readBlock.nothingDue' : 'chat.daySummary.nothingDue') : t('chat.daySummary.doneOfDue', { done, due: daySummary.due })}</p>{totalRows > 20 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.daySummary.rowCount', { shown: visibleRows.length, total: totalRows })}</p> : null}</>}
      actions={<>{visibleRows.length < payloadRows.length ? <IconButton label={t('chat.recordList.more')} onClick={() => setShownCount(count => count + 20)}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}{occurrences.isError || failedId !== null ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}</>} />
  </div>
}
