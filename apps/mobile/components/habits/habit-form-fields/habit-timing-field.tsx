import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useHabitFormInteraction } from './habit-form-interaction'
import { createTokensV2 } from '@/lib/theme'
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
  tokens: ReturnType<typeof createTokensV2>
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
  onToggle: () => void
  onError: (message: string) => void
  children: ReactNode
  tokens: ReturnType<typeof createTokensV2>
}

function FixedReminderEditors({ general, dueTime, enabled, offsets, clockCount, onOffsetsChange, onToggle, onError, children, tokens }: Readonly<FixedReminderEditorsProps>) {
  const { t } = useTranslation()
  if (general) return null
  if (!dueTime) return children
  return <ReminderSection inline nested tokens={tokens} reminderEnabled={enabled} reminderTimes={offsets} onReminderTimesChange={onOffsetsChange} onToggleReminder={onToggle} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={clockCount} onValidationError={onError} >{children}</ReminderSection>
}

export function HabitTimingField({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError, tokens }: Readonly<HabitTimingFieldProps>) {
  const { t } = useTranslation()
  const { disabled, guard } = useHabitFormInteraction()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const { form, isGeneral } = formHelpers
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const dueEndTime = useWatch({ control: form.control, name: 'dueEndTime' }) ?? ''
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const repeatReminder = useWatch({ control: form.control, name: 'repeatReminder' })
  const scheduledReminders = useWatch({ control: form.control, name: 'scheduledReminders' }) ?? []
  const dueDate = useWatch({ control: form.control, name: 'dueDate' })
  const [open, setOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const endTimeError = validateEndTime(dueTime, dueEndTime)
  const toggle = () => controller.setReminderEnabled(!reminderEnabled)
  const summary = buildHabitTimingSummary({ ...form.getValues(), isGeneral }, reminderTimes, displayTime, t)
  const clockReminders = <ScheduledReminderSection tokens={tokens} inline nested reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} offsetReminderCount={dueTime ? reminderTimes.length : 0} hideDayBefore={dueDate === getAccountDay(new Date(), profile?.timeZone)} onToggleReminder={toggle} onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })} onValidationError={showError} />
  return <>
    {/* eslint-disable-next-line local/max-button-words -- #1922 explicitly approves this timing-sheet entry label. */}
    <ListRow icon="bell" title={t('habits.form.timingAndReminder')} description={summary} placement="column" disabled={disabled} onClick={() => setOpen(true)} />
    {open ? <Sheet ref={sheetRef} open title={t('habits.form.timingAndReminder')} onClose={() => setOpen(false)} actions={<PillButton size="sm" onClick={() => closeSheet()}>{t('common.done')}</PillButton>}>
      <View style={{ gap: 24 }}>
        {!isGeneral ? <View style={{ gap: 16 }}>
          <TimeField disabled={disabled} label={t('habits.form.exactTime')} value={toTime24(dueTime)} onChange={guard(controller.setDueTime)} onClear={guard(controller.clearDueTime)} />
          {dueTime ? <TimeField disabled={disabled} label={t('habits.form.dueEndTime')} value={toTime24(dueEndTime)} error={endTimeError ? t(endTimeError) : undefined} onChange={(value) => form.setValue('dueEndTime', value, { shouldDirty: true })} onClear={() => form.setValue('dueEndTime', '', { shouldDirty: true })} /> : null}
        </View> : null}
        <RepeatReminderSection value={repeatReminder} enabled={reminderEnabled} general={isGeneral} timeZone={profile?.timeZone} onToggle={toggle} onChange={(value) => {
          form.setValue('repeatReminder', value, { shouldDirty: true })
          onReminderTimesChange(value ? [] : [...DEFAULT_REMINDER_TIMES])
          if (value) form.setValue('scheduledReminders', [], { shouldDirty: true })
        }}>
          <FixedReminderEditors general={isGeneral} dueTime={dueTime} enabled={reminderEnabled} offsets={reminderTimes} clockCount={scheduledReminders.length} onOffsetsChange={onReminderTimesChange} onToggle={toggle} onError={showError} tokens={tokens}>{clockReminders}</FixedReminderEditors>
        </RepeatReminderSection>
      </View>
    </Sheet> : null}
  </>
}
