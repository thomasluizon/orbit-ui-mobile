'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
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
  formHelpers: HabitFormHelpers
  controller: ReturnType<typeof createHabitFormController>
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  showError: (message: string) => void
}

interface FixedReminderEditorsProps {
  general: boolean
  dueTime: string
  enabled: boolean
  offsets: number[]
  clockCount: number
  onOffsetsChange: (times: number[]) => void
  onError: (message: string) => void
  children: ReactNode
}

function FixedReminderEditors({ general, dueTime, enabled, offsets, clockCount, onOffsetsChange, onError, children }: Readonly<FixedReminderEditorsProps>) {
  const t = useTranslations()
  if (general) return null
  if (!dueTime) return children
  return <ReminderSection  reminderEnabled={enabled} reminderTimes={offsets} onReminderTimesChange={onOffsetsChange} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={clockCount} onValidationError={onError} t={t}>{children}</ReminderSection>
}

export function HabitTimingField({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError }: Readonly<HabitTimingFieldProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const { form, isGeneral } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const dueEndTime = form.watch('dueEndTime') ?? ''
  const reminderEnabled = form.watch('reminderEnabled') ?? false
  const repeatReminder = form.watch('repeatReminder')
  const scheduledReminders = form.watch('scheduledReminders') ?? []
  const dueDate = form.watch('dueDate')
  const itemType = form.watch('itemType')
  const [open, setOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const endTimeError = validateEndTime(dueTime, dueEndTime)
  const toggle = () => controller.setReminderEnabled(!reminderEnabled)
  const summary = buildHabitTimingSummary({ ...form.getValues(), isGeneral }, reminderTimes, displayTime, t)
  const clockReminders = <ScheduledReminderSection reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} offsetReminderCount={dueTime ? reminderTimes.length : 0} hideDayBefore={itemType === 'task' && dueDate === getAccountDay(new Date(), profile?.timeZone)} onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })} onValidationError={showError} t={t} />
  return <>
    {/* eslint-disable-next-line local/max-button-words -- #1922 explicitly approves this timing-sheet entry label. */}
    <ListRow icon="bell" title={t('habits.form.timingAndReminder')} description={summary} placement="column" onClick={() => setOpen(true)} />
    {open ? <Sheet ref={sheetRef} open title={t('habits.form.timingAndReminder')} onClose={() => setOpen(false)} actions={<PillButton size="sm" onClick={() => closeSheet()}>{t('common.done')}</PillButton>}>
      <div className="flex min-w-0 flex-col gap-6">
        {!isGeneral ? <div className="flex min-w-0 flex-col gap-4">
          <TimeField label={t('habits.form.exactTime')} value={toTime24(dueTime)} onChange={controller.setDueTime} onClear={controller.clearDueTime} />
          {dueTime ? <TimeField label={t('habits.form.dueEndTime')} value={toTime24(dueEndTime)} error={endTimeError ? t(endTimeError) : undefined} onChange={(value) => form.setValue('dueEndTime', value, { shouldDirty: true })} onClear={() => form.setValue('dueEndTime', '', { shouldDirty: true })} /> : null}
        </div> : null}
        <RepeatReminderSection value={repeatReminder} enabled={reminderEnabled} general={isGeneral} timeZone={profile?.timeZone} onToggle={toggle} onChange={(value) => {
          form.setValue('repeatReminder', value, { shouldDirty: true })
          onReminderTimesChange(value ? [] : [...DEFAULT_REMINDER_TIMES])
          if (value) form.setValue('scheduledReminders', [], { shouldDirty: true })
        }}>
          <FixedReminderEditors general={isGeneral} dueTime={dueTime} enabled={reminderEnabled} offsets={reminderTimes} clockCount={scheduledReminders.length} onOffsetsChange={onReminderTimesChange} onError={showError}>{clockReminders}</FixedReminderEditors>
        </RepeatReminderSection>
      </div>
    </Sheet> : null}
  </>
}
