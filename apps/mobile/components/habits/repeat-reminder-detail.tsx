import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { useRef, useState } from 'react'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { repeatReminderClock, repeatReminderInstant } from '@orbit/shared/utils/repeat-reminders'
import { getAccountDateTime, toTime24 } from '@orbit/shared/utils'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useProfile } from '@/hooks/use-profile'
import { useCorrectHabitDose } from '@/hooks/use-correct-habit-dose'
import { ActionRow } from '@/components/ui/action-row'
import { DateField } from '@/components/ui/date-field'
import { TimeField } from '@/components/ui/time-field'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { IconButton } from '@/components/ui/icon-button'
import { Pencil, Clock, X } from '@/components/ui/icons'

export function RepeatReminderDetail({ habit, logs }: Readonly<{ habit: NormalizedHabit; logs: HabitLog[] }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayReminderClock: displayClock } = useTimeFormat()
  const [editing, setEditing] = useState<HabitLog | null>(null)
  return <View style={{ gap: 12 }}>
    {habit.nextReminderAtUtc ? <Text style={{ color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 20 }}>{t('habits.nextReminder', { time: displayClock(habit.nextReminderAtUtc) })}</Text> : null}
    {habit.repeatReminder ? logs.filter((log) => log.value > 0).map((log) => <View key={log.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 20 }}>{t('habits.takenAt', { time: displayClock(log.takenAtUtc ?? log.createdAtUtc) })}</Text>
      <IconButton label={t('habits.changeTakenAt')} onClick={() => setEditing(log)}><Pencil size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </View>) : null}
    {editing ? <DoseTimeEditor key={editing.id} habitId={habit.id} log={editing} onClose={() => setEditing(null)} /> : null}
  </View>
}

function DoseTimeEditor({ habitId, log, onClose }: Readonly<{ habitId: string; log: HabitLog; onClose: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const timeZone = profile?.timeZone
  const initial = log.takenAtUtc ?? log.createdAtUtc
  const [date, setDate] = useState(() => getAccountDateTime(new Date(initial), timeZone).date)
  const [clock, setClock] = useState(() => repeatReminderClock(initial, timeZone))
  const [exactInstant, setExactInstant] = useState<string | null>(() => new Date(initial).toISOString())
  const [error, setError] = useState('')
  const saving = useRef(false)
  const mutation = useCorrectHabitDose(habitId)
  const { sheetRef, closeSheet } = useSheetHost()
  async function save() {
    if (saving.current) return
    const takenAtUtc = exactInstant ?? repeatReminderInstant(date, clock, timeZone)
    if (!takenAtUtc) { setError(t('habits.form.invalidTime')); return }
    saving.current = true
    setError('')
    try {
      await mutation.mutateAsync({ logId: log.id, takenAtUtc })
      closeSheet(onClose, onClose)
    } catch { setError(t('habits.doseSaveError')) }
    finally { saving.current = false }
  }
  return <Sheet ref={sheetRef} open title={t('habits.changeTakenAt')} onClose={mutation.isPending ? undefined : onClose} actions={<ActionRow>
    <IconButton label={t('common.cancel')} disabled={mutation.isPending} onClick={() => closeSheet()}><X size={20} strokeWidth={1.5} /></IconButton>
    <PillButton size="sm" loading={mutation.isPending} disabled={mutation.isPending} onClick={() => void save()}>{t('common.save')}</PillButton>
  </ActionRow>}>
    <View style={{ gap: 12 }}>
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.statusBadText, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
      <DateField label={t('habits.doseDate')} value={date} onChange={(value) => { setExactInstant(null); setDate(value) }} disabled={mutation.isPending} />
      <TimeField label={t('habits.doseTime')} value={toTime24(clock)} onChange={(value) => { setExactInstant(null); setClock(value) }} disabled={mutation.isPending} />
      {log.reminderAtUtc ? <IconButton label={t('habits.useReminderTime')} disabled={mutation.isPending} onClick={() => {
        setExactInstant(new Date(log.reminderAtUtc!).toISOString())
        setDate(getAccountDateTime(new Date(log.reminderAtUtc!), timeZone).date)
        setClock(repeatReminderClock(log.reminderAtUtc!, timeZone))
      }}><Clock size={20} strokeWidth={1.5} /></IconButton> : null}
    </View>
  </Sheet>
}
