import { useRef, useState } from 'react'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { formatAPIDate, isHabitDoneForRange } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { PersonalText } from '@/components/ui/personal-text'
import { Button } from '@/components/ui/pill-button'
import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const occurrences = useHabits({ dateFrom: daySummary.date, dateTo: daySummary.date, includeGeneral: true, includeOverdue: true }, { completeDay: true })
  const logHabit = useLogHabit()
  const pending = useRef(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const payloadRows = daySummary.rows ?? []
  const visibleRows = payloadRows.slice(0, 20)
  const totalRows = daySummary.totalRows ?? payloadRows.length
  const missing = occurrences.data != null && visibleRows.some((item) => !occurrences.data.habitsById.has(item.id))
  const unavailable = occurrences.isError || missing
  const frameState = liveBlockState(occurrences, { acting: pendingId !== null, failed: failedId !== null, stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void occurrences.refetch() } })
  const toggle = (habitId: string, logged: boolean) => {
    if (pending.current || unavailable) return
    pending.current = true
    setPendingId(habitId)
    setFailedId(null)
    logHabit.mutate({ habitId, intent: logged ? 'unlog' : 'log', ...(daySummary.date !== formatAPIDate(new Date()) ? { date: daySummary.date } : {}) }, {
      onError: () => setFailedId(habitId),
      onSettled: () => { pending.current = false; setPendingId(null) },
    })
  }
  const done = Math.max(0, Math.min(daySummary.due, daySummary.done + payloadRows.reduce((delta, item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    return delta + (occurrence ? Number(isHabitDoneForRange(occurrence)) - Number(item.status === 'done') : 0)
  }, 0)))
  const completionRate = daySummary.due > 0 ? Math.round(done / daySummary.due * 100) : 0
  const rows = visibleRows.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const title = occurrence?.title ?? item.title
    const logged = occurrence ? isHabitDoneForRange(occurrence) : false
    return { id: item.id, wrapLabel: true, label: <InsetFocusPressable accessibilityRole="button" accessibilityLabel={t('chat.habitList.open', { name: title })} onPress={() => router.push({ pathname: '/habits/[id]', params: { id: item.id } })} style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, minWidth: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? tokens.bgHover : 'transparent' })}><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: tokens.bgWell }}><Text>{occurrence?.emoji ?? item.emoji ?? '•'}</Text></View><View style={{ flex: 1, minWidth: 0 }}><PersonalText style={{ color: tokens.fg1, fontSize: 14 }}>{title}</PersonalText></View></InsetFocusPressable>,
      meta: item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      ...(failedId === item.id ? { status: 'failed' as const } : {}),
      control: occurrence ? <InsetFocusPressable accessibilityRole="button" accessibilityLabel={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: title })} disabled={pendingId !== null || unavailable} accessibilityState={{ disabled: pendingId !== null || unavailable }} onPress={() => toggle(item.id, logged)} style={({ pressed }) => ({ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden', backgroundColor: pressed ? tokens.bgHover : 'transparent' })}><StatusRing status={logged ? 'done' : item.status === 'overdue' ? 'overdue' : 'empty'} size={24} label={t(logged ? 'chat.habitList.logged' : 'chat.habitList.pending')} /></InsetFocusPressable> : undefined,
    }
  })
  return <View style={{ width: '100%' }}>
    <BlockFrame {...frameState} title={t('chat.daySummary.title')} count={null} items={[
      ...rows,
      { id: 'overdue', label: t('chat.daySummary.overdue'), control: <Text style={{ color: tokens.fg1, fontSize: 16, fontVariant: ['tabular-nums'] }}>{daySummary.overdueCount}</Text> },
      { id: 'streak', label: t('chat.daySummary.streak'), control: <Text style={{ color: tokens.fg1, fontSize: 16, fontVariant: ['tabular-nums'] }}>{daySummary.currentStreak}</Text> },
    ]}
      body={<>{daySummary.due > 0 && daySummary.completionRate != null ? <ProgressRing value={completionRate} label={t('chat.daySummary.ring', { done, due: daySummary.due })} /> : null}<Text style={{ color: tokens.fg3, fontSize: 14 }}>{daySummary.due === 0 ? t('chat.daySummary.nothingDue') : t('chat.daySummary.doneOfDue', { done, due: daySummary.due })}</Text>{totalRows > 20 ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.daySummary.rowCount', { shown: visibleRows.length, total: totalRows })}</Text> : null}</>}
      actions={<>{occurrences.isError || failedId !== null ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}<Button variant="ghost" size="sm" onClick={() => router.push('/')}>{t('chat.daySummary.open')}</Button></>} />
  </View>
}
