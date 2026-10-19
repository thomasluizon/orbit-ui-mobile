'use client'

import { useRef, useState, type ReactNode } from 'react'
import { daySummaryLogControl } from '@orbit/shared/chat/day-summary-core'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { isHabitDoneForRange } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { PersonalText } from '@/components/ui/personal-text'
import { Button } from '@/components/ui/pill-button'
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
  return <button type="button" disabled={disabled} aria-label={label} onClick={onToggle} className="grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-transparent hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">{children}</button>
}

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const t = useTranslations()
  const navigate = useChatNavigation()
  const occurrences = useHabits({ dateFrom: daySummary.date, dateTo: daySummary.date, includeGeneral: true, includeOverdue: true }, undefined, { completeDay: true })
  const logHabit = useLogHabit()
  const pending = useRef(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const payloadRows = daySummary.rows ?? []
  const visibleRows = payloadRows.slice(0, 20)
  const totalRows = daySummary.totalRows ?? payloadRows.length
  const missing = occurrences.data != null && visibleRows.some((item) => !occurrences.data.habitsById.has(item.id))
  const unavailable = missing
  const frameState = liveBlockState(occurrences, { acting: pendingId !== null, failed: failedId !== null, stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void occurrences.refetch() } })
  const toggle = (habitId: string) => {
    const control = daySummaryLogControl(occurrences.data?.habitsById.get(habitId))
    if (pending.current || unavailable || control.undoUnavailable) return
    pending.current = true
    setPendingId(habitId)
    setFailedId(null)
    logHabit.mutate({ habitId, intent: control.logged ? 'unlog' : 'log', date: daySummary.date }, {
      onError: () => setFailedId(habitId),
      onSettled: () => { pending.current = false; setPendingId(null) },
    })
  }
  const done = Math.max(0, Math.min(daySummary.due, daySummary.done + payloadRows.reduce((delta, item) => {
    if (item.depth !== 0 || item.isBadHabit) return delta
    const occurrence = occurrences.data?.habitsById.get(item.id)
    return delta + (occurrence ? Number(isHabitDoneForRange(occurrence)) - Number(item.status === 'done') : 0)
  }, 0)))
  const completionRate = daySummary.due > 0 ? Math.round(done / daySummary.due * 100) : 0
  const rows = visibleRows.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const title = occurrence?.title ?? item.title
    const control = daySummaryLogControl(occurrence, item.status === 'overdue')
    const actionLabel = control.undoUnavailable ? `${title}: ${t(control.statusKey)}` : t(control.actionKey, { name: title })
    return { id: item.id, wrapLabel: true, label: <button type="button" aria-label={t('chat.habitList.open', { name: title })} onClick={() => navigate(`/habits/${item.id}`)} className="flex min-h-[var(--touch-min)] w-full min-w-0 items-center gap-3 rounded-[12px] border-0 bg-transparent px-2 py-1 text-left text-sm text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)]">{occurrence?.emoji ?? item.emoji ?? '•'}</span><PersonalText className="flex-1">{title}</PersonalText></button>,
      meta: control.status === 'bad' ? t('habits.statusDot.bad') : item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      ...(failedId === item.id ? { status: 'failed' as const } : {}),
      control: occurrence ? <DaySummaryControl readOnly={control.undoUnavailable} disabled={pendingId !== null || unavailable} label={actionLabel} onToggle={() => toggle(item.id)}><StatusRing status={control.status} size={24} label={t(control.statusKey)} /></DaySummaryControl> : undefined,
    }
  })
  return <div className="w-full">
    <BlockFrame {...frameState} title={t('chat.daySummary.title')} count={null} items={[
      ...rows,
      { id: 'overdue', wrapLabel: true, label: t('chat.daySummary.overdue'), control: <span className="tabular-nums">{daySummary.overdueCount}</span> },
      { id: 'streak', wrapLabel: true, label: t('chat.daySummary.streak'), control: <span className="tabular-nums">{daySummary.currentStreak}</span> },
    ]}
      body={<>{daySummary.due > 0 && daySummary.completionRate != null ? <ProgressRing value={completionRate} label={t('chat.daySummary.ring', { done, due: daySummary.due })} /> : null}<p className="text-sm text-[var(--fg-3)]">{daySummary.due === 0 ? t('chat.daySummary.nothingDue') : t('chat.daySummary.doneOfDue', { done, due: daySummary.due })}</p>{totalRows > 20 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.daySummary.rowCount', { shown: visibleRows.length, total: totalRows })}</p> : null}</>}
      actions={<>{occurrences.isError || failedId !== null ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}<Button variant="ghost" size="sm" onClick={() => navigate('/')}>{t('chat.daySummary.open')}</Button></>} />
  </div>
}
