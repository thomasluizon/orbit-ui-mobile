'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { RepeatReminderOptions } from '@orbit/shared/types/habit'
import { createHabitFormController, DEFAULT_REMINDER_TIMES, formatHabitReminderLabel, getAccountDay, toTime24 } from '@orbit/shared/utils'
import { buildHabitTimingSummary } from '@orbit/shared/utils/habit-timing-summary'
import { validateEndTime } from '@orbit/shared/validation'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'
import { ListRow } from '@/components/ui/list-row'
import { TimeField } from '@/components/ui/time-field'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { RepeatReminderSection } from './repeat-reminder-section'
import { ReminderSection } from './reminder-section'
import { ScheduledReminderSection } from './scheduled-reminder-section'

interface HabitTimingFieldProps {
  disabled: boolean
  formHelpers: HabitFormHelpers
  controller: ReturnType<typeof createHabitFormController>
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  showError: (message: string) => void
}

function HabitTimeQuestions({ formHelpers, controller, showReminderQuestion, onTimeAnswered }: Readonly<Pick<HabitTimingFieldProps, 'formHelpers' | 'controller'> & { showReminderQuestion: boolean; onTimeAnswered: () => void }>) {
  const t = useTranslations()
  const { form } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const dueEndTime = form.watch('dueEndTime') ?? ''
  const [endTimeExpanded, setShowEndTime] = useState<boolean | null>(null)
  const showEndTime = endTimeExpanded ?? Boolean(dueEndTime)
  const endTimeError = validateEndTime(dueTime, dueEndTime)
  const changeEndTime = (value: string) => {
    setShowEndTime(true)
    form.setValue('dueEndTime', value, { shouldDirty: true })
  }
  return <div className="flex min-w-0 flex-col gap-3">
          <TimeField label={t('habits.form.exactTime')} value={toTime24(dueTime)} onChange={controller.setDueTime} onClear={controller.clearDueTime} />
          {!dueTime ? <div><ListRow placement="field" title={t('habits.form.noSetTime')} expanded={showReminderQuestion} onClick={onTimeAnswered} /></div> : null}
          {dueTime ? <div><ListRow placement="field" title={t('habits.form.addEndTime')} expanded={showEndTime} onClick={() => setShowEndTime(!showEndTime)} /></div> : null}
          {dueTime && showEndTime ? <TimeField label={t('habits.form.dueEndTime')} value={toTime24(dueEndTime)} error={endTimeError ? t(endTimeError) : undefined} onChange={changeEndTime} onClear={() => changeEndTime('')} /> : null}
        </div>
}

interface HabitReminderEditorsProps {
  formHelpers: HabitFormHelpers
  controller: ReturnType<typeof createHabitFormController>
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  showError: (message: string) => void
}

/** One change of the repeat reminder. A repeat drops the reminders at set times, and no repeat brings the default times back. */
export function changeHabitRepeatReminder(form: HabitFormHelpers['form'], onReminderTimesChange: (times: number[]) => void, value: RepeatReminderOptions | null) {
  form.setValue('repeatReminder', value, { shouldDirty: true })
  onReminderTimesChange(value ? [] : [...DEFAULT_REMINDER_TIMES])
  if (value) form.setValue('scheduledReminders', [], { shouldDirty: true })
}

/** The editor of the reminders at set times: the offsets from the time, then the clock reminders. An undated item has none. */
export function HabitFixedReminderEditors({ formHelpers, reminderTimes, onReminderTimesChange, showError }: Readonly<Omit<HabitReminderEditorsProps, 'controller'>>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { form, isGeneral } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const reminderEnabled = form.watch('reminderEnabled') ?? false
  const scheduledReminders = form.watch('scheduledReminders') ?? []
  if (isGeneral) return null
  const clockReminders = <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} offsetReminderCount={dueTime ? reminderTimes.length : 0} hideDayBefore={form.watch('itemType') === 'task' && form.watch('dueDate') === getAccountDay(new Date(), profile?.timeZone)} onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })} onValidationError={showError} t={t} />
  if (!dueTime) return clockReminders
  return <ReminderSection reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={scheduledReminders.length} onValidationError={showError} t={t}>{clockReminders}</ReminderSection>
}

/** The reminder switch with its permission notice, the two reminder kinds and the editor of each kind. */
function HabitReminderEditors({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError }: Readonly<HabitReminderEditorsProps>) {
  const { profile } = useProfile()
  const { form, isGeneral } = formHelpers
  const reminderEnabled = form.watch('reminderEnabled') ?? false
  return <RepeatReminderSection value={form.watch('repeatReminder')} enabled={reminderEnabled} general={isGeneral} timeZone={profile?.timeZone} onToggle={() => controller.setReminderEnabled(!reminderEnabled)} onChange={(value) => changeHabitRepeatReminder(form, onReminderTimesChange, value)}>
    <HabitFixedReminderEditors formHelpers={formHelpers} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} />
  </RepeatReminderSection>
}

export function HabitTimingField({ disabled, formHelpers, controller, reminderTimes, onReminderTimesChange, showError }: Readonly<HabitTimingFieldProps>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const { form, isGeneral } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const reminderEnabled = form.watch('reminderEnabled') ?? false
  const [open, setOpen] = useState(false)
  const [timeAnswered, setTimeAnswered] = useState(false)
  const showReminderQuestion = isGeneral || Boolean(dueTime) || timeAnswered || reminderEnabled
  const { sheetRef, closeSheet } = useSheetHost()
  const summary = buildHabitTimingSummary({ ...form.getValues(), isGeneral }, reminderTimes, displayTime, t)
  return <>
    {/* eslint-disable-next-line local/max-button-words -- #1922 explicitly approves this timing-sheet entry label. */}
    <ListRow wrapTitle icon="bell" title={t('habits.form.timingAndReminder')} description={summary} placement="column" onClick={() => setOpen(true)} />
    {open ? <Sheet ref={sheetRef} open title={t('habits.form.timingAndReminder')} onClose={() => setOpen(false)} actions={<PillButton size="sm" onClick={() => closeSheet()}>{t('common.done')}</PillButton>}>
      <fieldset disabled={disabled} data-timing-levels className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0 pb-2">
        {!isGeneral ? <HabitTimeQuestions formHelpers={formHelpers} controller={controller} showReminderQuestion={showReminderQuestion} onTimeAnswered={() => setTimeAnswered(true)} /> : null}
        {showReminderQuestion ? <HabitReminderEditors formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} /> : null}
      </fieldset>
    </Sheet> : null}
  </>
}
