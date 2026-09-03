'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatHabitReminderLabel } from '@orbit/shared/utils'
import type { NormalizedHabit, UpdateHabitRequest } from '@orbit/shared/types/habit'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { useAppToast } from '@/hooks/use-app-toast'
import { GoalLinkingField } from './goal-linking-field'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

type DetailField = 'goals' | 'reminders' | 'schedule' | 'time' | 'description' | 'endDate'
type HabitPatch = Parameters<(habit: NormalizedHabit, patch: Partial<UpdateHabitRequest>) => void>[1]

interface HabitDetailFieldsProps {
  habit: NormalizedHabit
  hasProAccess: boolean
  locale: string
  summary: string
  onPatch: (patch: HabitPatch) => Promise<boolean>
  onUpgrade: () => void
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const FREQUENCY_UNITS = ['Day', 'Week', 'Month', 'Year'] as const

function FieldActions({ onCancel, onSave }: Readonly<{ onCancel: () => void; onSave: () => void }>) {
  const t = useTranslations()
  return <div className="flex gap-2"><PillButton variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel')}</PillButton><PillButton size="sm" onClick={onSave}>{t('common.save')}</PillButton></div>
}

function FieldWell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-3 mb-3 flex flex-col gap-3 rounded-[var(--r-well)] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]" style={{ animation: 'habit-detail-fade 160ms var(--ease-standard)' }}>{children}</div>
}

function TextEditor({ initialValue, multiline = false, onCancel, onSave }: Readonly<{ initialValue: string; multiline?: boolean; onCancel: () => void; onSave: (value: string) => void }>) {
  const [value, setValue] = useState(initialValue)
  const className = 'w-full rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 py-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]'
  return <FieldWell>{multiline ? <textarea autoFocus value={value} rows={4} className={className} onChange={(event) => setValue(event.target.value)} /> : <input autoFocus value={value} className={className} onChange={(event) => setValue(event.target.value)} />}<FieldActions onCancel={onCancel} onSave={() => onSave(value.trim())} /></FieldWell>
}

function ScheduleEditor({ habit, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; onCancel: () => void; onSave: (patch: HabitPatch) => void }>) {
  const t = useTranslations()
  const [unit, setUnit] = useState<(typeof FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(habit.frequencyQuantity ?? 1)
  const [days, setDays] = useState(habit.days)
  return (
    <FieldWell>
      <div className="flex gap-2">
        <input min={1} type="number" value={quantity} aria-label={t('habits.form.frequencyRequired')} className="w-20 rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 py-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)]" onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
        <select value={unit} aria-label={t('habits.detail.schedule')} className="min-h-11 flex-1 rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)]" onChange={(event) => setUnit(event.target.value as (typeof FREQUENCY_UNITS)[number])}>
          {FREQUENCY_UNITS.map((value) => <option key={value} value={value}>{t(`habits.form.unit${value}`)}</option>)}
        </select>
      </div>
      {unit === 'Day' ? <div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => { const selected = days.includes(day); return <button key={day} type="button" aria-pressed={selected} className={selected ? 'chip chip-active' : 'chip'} onClick={() => setDays((current) => selected ? current.filter((value) => value !== day) : [...current, day])}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</button> })}</div> : null}
      <FieldActions onCancel={onCancel} onSave={() => onSave({ frequencyUnit: unit, frequencyQuantity: quantity, days: unit === 'Day' ? days : [] })} />
    </FieldWell>
  )
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const t = useTranslations()
  if (!habit.isBadHabit) return null
  return <ListRow title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}

export function formatHabitDetailReminderValue(habit: Pick<NormalizedHabit, 'reminderEnabled' | 'reminderTimes' | 'scheduledReminders'>, t: ReturnType<typeof useTranslations>): string {
  if (!habit.reminderEnabled) return t('habits.detail.noValue')
  const values = [
    ...habit.reminderTimes.map((minutes) => formatHabitReminderLabel(minutes, (key) => t(key))),
    ...habit.scheduledReminders.map((reminder) => reminder.time),
  ]
  return values.length ? values.join(', ') : t('habits.detail.noValue')
}

export function HabitDetailFields({ habit, hasProAccess, locale, summary, onPatch, onUpgrade }: Readonly<HabitDetailFieldsProps>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const [openField, setOpenField] = useState<DetailField | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(habit.reminderEnabled)
  const [reminderTimes, setReminderTimes] = useState(habit.reminderTimes)
  const [scheduledReminders, setScheduledReminders] = useState(habit.scheduledReminders)
  const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const close = () => setOpenField(null)
  const save = (patch: HabitPatch) => { void onPatch(patch).then((saved) => { if (saved) close() }) }
  const toggleGoal = (goalId: string) => {
    const next = goalIds.includes(goalId) ? goalIds.filter((id) => id !== goalId) : [...goalIds, goalId]
    setGoalIds(next)
    void onPatch({ goalIds: next })
  }
  const updateReminders = (next: { enabled?: boolean; offsets?: number[]; scheduled?: typeof scheduledReminders }) => {
    const enabled = next.enabled ?? reminderEnabled
    const offsets = next.offsets ?? reminderTimes
    const scheduled = next.scheduled ?? scheduledReminders
    setReminderEnabled(enabled)
    setReminderTimes(offsets)
    setScheduledReminders(scheduled)
    void onPatch({ reminderEnabled: enabled, reminderTimes: offsets, scheduledReminders: scheduled })
  }
  const reminderHabit = { ...habit, reminderEnabled, reminderTimes, scheduledReminders }
  return (
    <div className="flex flex-col gap-1">
      <ListRow title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'goals' ? null : 'goals')} />
      {openField === 'goals' ? <FieldWell><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={false} onToggleGoal={toggleGoal} /></FieldWell> : null}
      <ListRow title={t('habits.detail.reminders')} value={formatHabitDetailReminderValue(reminderHabit, t)} onClick={() => setOpenField(openField === 'reminders' ? null : 'reminders')} />
      {openField === 'reminders' ? <FieldWell>{habit.dueTime ? <ReminderSection reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={(offsets) => updateReminders({ offsets })} onToggleReminder={() => updateReminders({ enabled: !reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} t={t} /> : <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} t={t} />}</FieldWell> : null}
      <ListRow title={t('habits.detail.schedule')} value={summary} onClick={() => setOpenField(openField === 'schedule' ? null : 'schedule')} />
      {openField === 'schedule' ? <ScheduleEditor habit={habit} onCancel={close} onSave={save} /> : null}
      <ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'time' ? null : 'time')} />
      {openField === 'time' ? <TextEditor initialValue={habit.dueTime ?? ''} onCancel={close} onSave={(dueTime) => save({ dueTime })} /> : null}
      <ListRow title={t('habits.detail.description')} value={habit.description ?? t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'description' ? null : 'description')} />
      {openField === 'description' ? <TextEditor initialValue={habit.description ?? ''} multiline onCancel={close} onSave={(description) => save({ description })} /> : null}
      <ListRow title={t('habits.detail.endDate')} value={habit.endDate ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${habit.endDate}T00:00:00`)) : t('habits.detail.noValue')} onClick={() => setOpenField(openField === 'endDate' ? null : 'endDate')} />
      {openField === 'endDate' ? <TextEditor initialValue={habit.endDate ?? ''} onCancel={close} onSave={(endDate) => save({ endDate: endDate || null })} /> : null}
      <SlipAlertRow habit={habit} hasProAccess={hasProAccess} onPatch={onPatch} onUpgrade={onUpgrade} />
      <ListRow title={t('habits.detail.startedOn')} value={new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(habit.createdAtUtc))} readOnly />
    </div>
  )
}
