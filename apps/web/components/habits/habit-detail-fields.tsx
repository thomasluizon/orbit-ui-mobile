'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useHabitDetailFieldsState, type HabitDetailPatch } from '@orbit/shared/hooks'
import {
  buildHabitDetailSchedulePatch,
  formatHabitDetailReminderValue,
  formatHabitReminderLabel,
  HABIT_DETAIL_FREQUENCY_UNITS,
  HABIT_DETAIL_WEEKDAYS,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { useAppToast } from '@/hooks/use-app-toast'
import { GoalLinkingField } from './goal-linking-field'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

interface HabitDetailFieldsProps {
  habit: NormalizedHabit
  hasProAccess: boolean
  locale: string
  summary: string
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>
  onUpgrade: () => void
}

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

function ScheduleEditor({ habit, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const t = useTranslations()
  const [unit, setUnit] = useState<(typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(habit.frequencyQuantity ?? 1)
  const [days, setDays] = useState(habit.days)
  return (
    <FieldWell>
      <div className="flex gap-2">
        <input min={1} type="number" value={quantity} aria-label={t('habits.form.frequencyRequired')} className="w-20 rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 py-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)]" onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
        <select value={unit} aria-label={t('habits.detail.schedule')} className="min-h-11 flex-1 rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)]" onChange={(event) => setUnit(event.target.value as (typeof HABIT_DETAIL_FREQUENCY_UNITS)[number])}>
          {HABIT_DETAIL_FREQUENCY_UNITS.map((value) => <option key={value} value={value}>{t(`habits.form.unit${value}`)}</option>)}
        </select>
      </div>
      {unit === 'Day' ? <div className="flex flex-wrap gap-2">{HABIT_DETAIL_WEEKDAYS.map((day) => { const selected = days.includes(day); return <button key={day} type="button" aria-pressed={selected} className={selected ? 'chip chip-active' : 'chip'} onClick={() => setDays((current) => selected ? current.filter((value) => value !== day) : [...current, day])}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</button> })}</div> : null}
      <FieldActions onCancel={onCancel} onSave={() => onSave(buildHabitDetailSchedulePatch(unit, quantity, days))} />
    </FieldWell>
  )
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const t = useTranslations()
  if (!habit.isBadHabit) return null
  return <ListRow title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}

export function HabitDetailFields({ habit, hasProAccess, locale, summary, onPatch, onUpgrade }: Readonly<HabitDetailFieldsProps>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const fields = useHabitDetailFieldsState(habit, onPatch)
  const { close, goalIds, openField, reminderHabit, save, toggleField, toggleGoal, updateReminders } = fields
  return (
    <div className="flex flex-col gap-1">
      <ListRow title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => toggleField('goals')} />
      {openField === 'goals' ? <FieldWell><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={false} onToggleGoal={toggleGoal} /></FieldWell> : null}
      <ListRow title={t('habits.detail.reminders')} value={formatHabitDetailReminderValue(reminderHabit, (key) => t(key))} onClick={() => toggleField('reminders')} />
      {openField === 'reminders' ? <FieldWell>{habit.dueTime ? <ReminderSection reminderEnabled={reminderHabit.reminderEnabled} reminderTimes={reminderHabit.reminderTimes} onReminderTimesChange={(offsets) => updateReminders({ offsets })} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} t={t} /> : <ScheduledReminderSection reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} t={t} />}</FieldWell> : null}
      <ListRow title={t('habits.detail.schedule')} value={summary} onClick={() => toggleField('schedule')} />
      {openField === 'schedule' ? <ScheduleEditor habit={habit} onCancel={close} onSave={save} /> : null}
      <ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => toggleField('time')} />
      {openField === 'time' ? <TextEditor initialValue={habit.dueTime ?? ''} onCancel={close} onSave={(dueTime) => save({ dueTime })} /> : null}
      <ListRow title={t('habits.detail.description')} value={habit.description ?? t('habits.detail.noValue')} onClick={() => toggleField('description')} />
      {openField === 'description' ? <TextEditor initialValue={habit.description ?? ''} multiline onCancel={close} onSave={(description) => save({ description })} /> : null}
      <ListRow title={t('habits.detail.endDate')} value={habit.endDate ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${habit.endDate}T00:00:00`)) : t('habits.detail.noValue')} onClick={() => toggleField('endDate')} />
      {openField === 'endDate' ? <TextEditor initialValue={habit.endDate ?? ''} onCancel={close} onSave={(endDate) => save({ endDate: endDate || null })} /> : null}
      <SlipAlertRow habit={habit} hasProAccess={hasProAccess} onPatch={onPatch} onUpgrade={onUpgrade} />
      <ListRow title={t('habits.detail.startedOn')} value={new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(habit.createdAtUtc))} readOnly />
    </div>
  )
}
