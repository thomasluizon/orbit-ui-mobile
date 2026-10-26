import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown } from '@/components/ui/icons'
import { useRef, useState } from 'react'
import { daySummaryLogControl, habitSnapshotCheck } from '@orbit/shared/chat/day-summary-core'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { getAccountDay } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HabitCheck } from '@/components/habits/habit-check'
import { HabitBlockRow } from './habit-block-row'
import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function DaySummaryControl({ readOnly, disabled, label, onToggle, status, statusLabel }: Readonly<{
  readOnly: boolean
  disabled: boolean
  label: string
  onToggle: () => void
  status: HabitStatus
  statusLabel: string
}>) {
  if (readOnly) return <View style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' }}><HabitCheck status={status} label={statusLabel} /></View>
  return <InsetFocusPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled: disabled }} onPress={onToggle} style={() => ({ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden', backgroundColor: 'transparent' })}>{({ pressed }) => <HabitCheck status={status} label={statusLabel} feedback={pressed} />}</InsetFocusPressable>
}

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const { t } = useTranslation()
  const navigate = useChatNavigation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const occurrences = useHabits({ dateFrom: daySummary.date, dateTo: daySummary.date, includeGeneral: true, includeOverdue: true }, { completeDay: true })
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
    const check = occurrence ? control : habitSnapshotCheck(item)
    const actionLabel = control.undoUnavailable ? `${title}: ${t(control.statusKey)}` : t(control.actionKey, { name: title })
    return <HabitBlockRow key={item.id} title={title} emoji={item.emoji} label={t('chat.habitList.open', { name: title })}
      onOpen={() => navigate({ pathname: '/habits/[id]', params: { id: item.id, date: daySummary.date } })} control={<DaySummaryControl readOnly={!occurrence || unavailable || control.undoUnavailable || !control.writeAllowed} disabled={pendingId !== null || unavailable} label={actionLabel} onToggle={() => toggle(item.id)} status={check.status} statusLabel={t(check.statusKey)} />} />
  })
  return <View style={{ width: '100%' }}>
    <BlockFrame {...frameState} title={t(daySummary.read ? 'chat.readBlock.dayTitle' : 'chat.daySummary.title')} count={null} items={[
      { id: 'overdue', wrapLabel: true, label: t('chat.daySummary.overdue'), control: <Text style={{ color: tokens.fg1, fontSize: 16, fontVariant: ['tabular-nums'] }}>{daySummary.overdueCount}</Text> },
      ...(!daySummary.read ? [{ id: 'streak', wrapLabel: true, label: t('chat.daySummary.streak'), control: <Text style={{ color: tokens.fg1, fontSize: 16, fontVariant: ['tabular-nums'] }}>{daySummary.currentStreak}</Text> }] : []),
    ]}
      body={<><View style={{ gap: 8 }}>{rows}</View>{daySummary.due > 0 && daySummary.completionRate != null ? <ProgressRing value={completionRate} label={t(daySummary.read ? 'chat.daySummary.doneOfDue' : 'chat.daySummary.ring', { done, due: daySummary.due })} /> : null}<Text style={{ color: tokens.fg3, fontSize: 14 }}>{daySummary.due === 0 ? t(daySummary.read ? 'chat.readBlock.nothingDue' : 'chat.daySummary.nothingDue') : t('chat.daySummary.doneOfDue', { done, due: daySummary.due })}</Text>{totalRows > 20 ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.daySummary.rowCount', { shown: visibleRows.length, total: totalRows })}</Text> : null}</>}
      actions={<>{visibleRows.length < payloadRows.length ? <IconButton label={t('chat.recordList.more')} onClick={() => setShownCount(count => count + 20)}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}{occurrences.isError || failedId !== null ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}</>} />
  </View>
}
