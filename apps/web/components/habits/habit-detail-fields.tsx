'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useHabitDetailFieldsState } from '@/hooks/use-habit-detail-fields-state'
import type { HabitDetailPatch } from '@orbit/shared/hooks'
import type { Time24 } from '@orbit/shared/contracts/forms'
import {
  buildHabitDetailSchedulePatch,
  buildHabitDetailTimePatch,
  canInlineEditHabitSchedule,
  formatHabitReminderLabel,
  HABIT_DETAIL_FREQUENCY_UNITS,
  HABIT_DETAIL_WEEKDAYS,
  toggleHabitDaySelection,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { MAX_GOALS_PER_HABIT } from '@orbit/shared/validation'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { Input } from '@/components/ui/input'
import { X } from '@/components/ui/icons'
import { DateField } from '@/components/ui/date-field'
import { HabitChecklist } from './habit-checklist'
import { ChecklistTemplates } from './checklist-templates'
import { HabitDetailTags } from './habit-detail-tags'
import { GoalLinkingField } from './goal-linking-field'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'

interface HabitDetailFieldsProps {
  habit: NormalizedHabit
  hasProAccess: boolean
  relationshipControlsAvailable: boolean
  onItemsChange: (items: NormalizedHabit['checklistItems']) => void
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>
  onUpgrade: () => void
}

function FieldActions({ onCancel, onSave }: Readonly<{ onCancel: () => void; onSave: () => void }>) {
  const t = useTranslations()
  return <div className="flex gap-2"><PillButton variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel')}</PillButton><PillButton variant="secondary" size="sm" onClick={onSave}>{t('common.save')}</PillButton></div>
}

function FieldWell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex flex-col gap-3" style={{ animation: 'habit-detail-fade 160ms var(--ease-standard)' }}>{children}</div>
}

function FrequencyUnitOption({ label, selected, onSelect }: Readonly<{ label: string; selected: boolean; onSelect: () => void }>) {
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled: false, onSelect, selected })
  return <button ref={elementRef} type="button" role="radio" aria-checked={selected} tabIndex={tabIndex} className={`chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${selected ? 'chip-active' : ''}`} onClick={onActivate} onKeyDown={onKeyDown}>{label}</button>
}

function ScheduleEditor({ habit, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const [unit, setUnit] = useState<(typeof HABIT_DETAIL_FREQUENCY_UNITS)[number]>(habit.frequencyUnit ?? 'Day')
  const [quantity, setQuantity] = useState(habit.frequencyQuantity ?? 1)
  const [days, setDays] = useState(habit.days)
  return (
    <FieldWell>
      <div className="flex gap-2">
        <input min={1} type="number" value={quantity} data-focus-perimeter="" aria-label={t('habits.form.frequencyRequired')} className="w-20 rounded-[var(--r-well)] border-0 bg-[var(--bg)] px-3 py-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight]" onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
        <RadioGroup aria-label={t('habits.detail.schedule')} className="flex min-w-0 flex-1 flex-wrap gap-2">
          {HABIT_DETAIL_FREQUENCY_UNITS.map((value) => <FrequencyUnitOption key={value} label={t(`habits.form.unit${value}`)} selected={unit === value} onSelect={() => setUnit(value)} />)}
        </RadioGroup>
      </div>
      {unit === 'Day' && quantity === 1 ? <div className="flex flex-wrap gap-1">{HABIT_DETAIL_WEEKDAYS.map((day) => { const selected = days.length === 0 || days.includes(day); return <button key={day} type="button" aria-label={t(`dates.daysLong.${day.toLowerCase()}`)} aria-pressed={selected} className={selected ? 'chip chip-active' : 'chip'} onClick={() => setDays((current) => toggleHabitDaySelection(current, day, HABIT_DETAIL_WEEKDAYS, current.length === 0))}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</button> })}</div> : null}
      <FieldActions onCancel={onCancel} onSave={() => { const patch = buildHabitDetailSchedulePatch(unit, quantity, days); if (patch) onSave(patch); else showError(t('habits.form.frequencyRequired')) }} />
    </FieldWell>
  )
}

export function HabitDetailSchedule({ habit, summary, open, onToggle, onCancel, onSave }: Readonly<{ habit: NormalizedHabit; summary: string; open: boolean; onToggle: () => void; onCancel: () => void; onSave: (patch: HabitDetailPatch) => void }>) {
  const t = useTranslations()
  const editable = canInlineEditHabitSchedule(habit)
  if (!editable && !summary) return null
  if (editable && habit.frequencyUnit === 'Day' && habit.frequencyQuantity === 1) return <section className="flex flex-col gap-2"><p className="text-sm font-medium text-[var(--fg-2)]">{t('habits.detail.schedule')}</p><div className="flex flex-wrap gap-1">{HABIT_DETAIL_WEEKDAYS.map((day) => { const selected = habit.days.length === 0 || habit.days.includes(day); return <button key={day} type="button" aria-label={t(`dates.daysLong.${day.toLowerCase()}`)} aria-pressed={selected} className={`${selected ? 'bg-[var(--primary-dim)] text-[var(--fg-1)]' : 'bg-[var(--bg-well)] text-[var(--fg-2)]'} size-11 shrink-0 rounded-full text-sm font-medium transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`} style={{ boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 1px var(--hairline)' }} onClick={() => { const patch = buildHabitDetailSchedulePatch('Day', 1, toggleHabitDaySelection(habit.days, day, HABIT_DETAIL_WEEKDAYS, habit.days.length === 0)); if (patch) onSave(patch) }}>{t(`dates.daysShort.${day.toLowerCase()}`).charAt(0)}</button> })}</div></section>
  return <><ListRow title={t('habits.detail.schedule')} value={summary} readOnly={!editable} onClick={editable ? onToggle : undefined} />{open ? <ScheduleEditor habit={habit} onCancel={onCancel} onSave={onSave} /> : null}</>
}

function SlipAlertRow({ habit, hasProAccess, onPatch, onUpgrade }: Readonly<{ habit: NormalizedHabit; hasProAccess: boolean; onPatch: HabitDetailFieldsProps['onPatch']; onUpgrade: () => void }>) {
  const t = useTranslations()
  if (!habit.isBadHabit) return null
  return <ListRow title={t('habits.detail.slipAlert')} description={t('habits.detail.slipAlertDescription')} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void onPatch({ slipAlertEnabled }) }} /> : undefined} chevron={!hasProAccess} onClick={!hasProAccess ? onUpgrade : undefined} />
}


export function HabitDetailFields({ habit, hasProAccess, relationshipControlsAvailable, onItemsChange, onPatch, onUpgrade }: Readonly<HabitDetailFieldsProps>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const { cancelReminders, goalIds, openField, reminderHabit, saveReminders, toggleField, toggleGoal, updateReminders } = useHabitDetailFieldsState(habit, onPatch)
  const [description, setDescription] = useState(habit.description ?? '')
  const [savedDescription, setSavedDescription] = useState(habit.description ?? '')
  if ((habit.description ?? '') !== savedDescription) {
    setSavedDescription(habit.description ?? '')
    if (description === savedDescription) setDescription(habit.description ?? '')
  }

  const saveReminderDraft = () => {
    const validationError = saveReminders()
    if (validationError) showError(t(validationError))
  }
  return (
    <div className="flex flex-col gap-6">
      <TimeField label={t('habits.form.exactTime')} hint={t('habits.form.anyTimeHint')} value={(habit.dueTime ?? '') as Time24 | ''} onChange={(time) => { const patch = buildHabitDetailTimePatch(time, habit); if (patch) void onPatch(patch) }} onClear={() => { const patch = buildHabitDetailTimePatch('', habit); if (patch) void onPatch(patch) }} />
      <section>
        <p className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.reminders')}</p>
        {habit.dueTime ? <ReminderSection reminderEnabled={reminderHabit.reminderEnabled} reminderTimes={reminderHabit.reminderTimes} onReminderTimesChange={(offsets) => updateReminders({ offsets })} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} scheduledReminderCount={reminderHabit.scheduledReminders.length} onValidationError={showError} t={t}>
          <ScheduledReminderSection reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} offsetReminderCount={reminderHabit.reminderTimes.length} nested t={t} />
        </ReminderSection> : <ScheduledReminderSection reminderEnabled={reminderHabit.reminderEnabled} scheduledReminders={reminderHabit.scheduledReminders} onToggleReminder={() => updateReminders({ enabled: !reminderHabit.reminderEnabled })} onSetScheduledReminders={(scheduled) => updateReminders({ scheduled })} onValidationError={showError} t={t} />}
        <FieldActions onCancel={cancelReminders} onSave={saveReminderDraft} />
      </section>
      <section>
        <p className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.checklist')}</p>
        <HabitChecklist items={habit.checklistItems} editable onItemsChange={onItemsChange} />
        <ChecklistTemplates items={habit.checklistItems} onLoad={onItemsChange} />
      </section>
      <section>
        <Switch label={t('habits.form.habitTypeAvoid')} checked={habit.isBadHabit} onChange={(isBadHabit) => { void onPatch({ isBadHabit }) }} />
        <p className="text-sm text-[var(--fg-3)]">{t('habits.form.habitTypeAvoidHint')}</p>
      </section>
      {relationshipControlsAvailable ? <SlipAlertRow habit={habit} hasProAccess={hasProAccess} onPatch={onPatch} onUpgrade={onUpgrade} /> : null}
      {relationshipControlsAvailable ? <HabitDetailTags habit={habit} /> : null}
      {relationshipControlsAvailable ? <><ListRow title={t('habits.detail.linkedGoals')} value={goalIds.length ? String(goalIds.length) : t('habits.detail.noValue')} onClick={() => toggleField('goals')} />{openField === 'goals' ? <FieldWell><GoalLinkingField selectedGoalIds={goalIds} atGoalLimit={goalIds.length >= MAX_GOALS_PER_HABIT} onToggleGoal={toggleGoal} /></FieldWell> : null}</> : null}
      <section>
        <p className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.endDate')}</p>
        <DateField label={t('habits.form.endDate')} value={habit.endDate ?? ''} placeholder={t('habits.form.endDatePlaceholder')} onChange={(endDate) => { void onPatch({ endDate: endDate || null }) }} />
        {habit.endDate ? <PillButton variant="ghost" size="sm" iconOnly label={t('habits.form.removeEndDate')} onClick={() => { void onPatch({ endDate: null }) }}><X size={20} /></PillButton> : null}
      </section>
      <Input label={t('habits.form.description')} value={description} onChange={setDescription} onBlur={() => { if (description.trim() !== (habit.description ?? '')) void onPatch({ description: description.trim() }) }} multiline rows={3} maxLength={10000} />
    </div>
  )
}
