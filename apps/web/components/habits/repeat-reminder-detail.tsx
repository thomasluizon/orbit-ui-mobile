'use client'

import { useTranslations } from 'next-intl'
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
import { Pencil } from '@/components/ui/icons'

export function RepeatReminderDetail({ habit, logs }: Readonly<{ habit: NormalizedHabit; logs: HabitLog[] }>) {
  const t = useTranslations()
  const { displayReminderClock: displayClock } = useTimeFormat()
  const [editing, setEditing] = useState<HabitLog | null>(null)
  return <div className="flex min-w-0 flex-col gap-3">
    {habit.nextReminderAtUtc ? <p className="text-xs font-mono text-[var(--fg-3)]">{t('habits.nextReminder', { time: displayClock(habit.nextReminderAtUtc) })}</p> : null}
    {habit.repeatReminder ? logs.filter((log) => log.value > 0).map((log) => <div key={log.id} className="flex flex-wrap items-center gap-2">
      <p className="text-xs font-mono text-[var(--fg-3)]">{t('habits.takenAt', { time: displayClock(log.takenAtUtc ?? log.createdAtUtc) })}</p>
      <IconButton label={t('habits.changeTakenAt')} onClick={() => setEditing(log)}><Pencil size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    </div>) : null}
    {editing ? <DoseTimeEditor key={editing.id} habitId={habit.id} log={editing} onClose={() => setEditing(null)} /> : null}
  </div>
}

function DoseTimeEditor({ habitId, log, onClose }: Readonly<{ habitId: string; log: HabitLog; onClose: () => void }>) {
  const t = useTranslations()
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
      closeSheet(onClose)
    } catch { setError(t('habits.doseSaveError')) }
    finally { saving.current = false }
  }
  return <Sheet ref={sheetRef} open title={t('habits.changeTakenAt')} onClose={mutation.isPending ? undefined : onClose} actions={<ActionRow>
    <PillButton size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => closeSheet()}>{t('common.cancel')}</PillButton>
    <PillButton size="sm" loading={mutation.isPending} disabled={mutation.isPending} onClick={() => void save()}>{t('common.save')}</PillButton>
  </ActionRow>}>
    <div className="flex min-w-0 flex-col gap-3">
      {error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p> : null}
      <fieldset disabled={mutation.isPending}><DateField label={t('habits.doseDate')} value={date} onChange={(value) => { setExactInstant(null); setDate(value) }} /></fieldset>
      <TimeField label={t('habits.doseTime')} value={toTime24(clock)} onChange={(value) => { setExactInstant(null); setClock(value) }} disabled={mutation.isPending} />
      {log.reminderAtUtc ? <PillButton size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => {
        setExactInstant(new Date(log.reminderAtUtc!).toISOString())
        setDate(getAccountDateTime(new Date(log.reminderAtUtc!), timeZone).date)
        setClock(repeatReminderClock(log.reminderAtUtc!, timeZone))
      }}>{t('habits.useReminderTime')}</PillButton> : null}
    </div>
  </Sheet>
}
