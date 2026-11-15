import { useState } from 'react'
import { View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useHabitFormInteraction } from './habit-form-interaction'
import { createTokensV2 } from '@/lib/theme'
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
  tokens: ReturnType<typeof createTokensV2>
  formHelpers: HabitFormHelpers
  controller: ReturnType<typeof createHabitFormController>
  reminderTimes: number[]
  onReminderTimesChange: (times: number[]) => void
  showError: (message: string) => void
}

function HabitTimeQuestions({ formHelpers, controller, showReminderQuestion, onTimeAnswered }: Readonly<Pick<HabitTimingFieldProps, 'formHelpers' | 'controller'> & { showReminderQuestion: boolean; onTimeAnswered: () => void }>) {
  const { t } = useTranslation()
  const { disabled, guard } = useHabitFormInteraction()
  const { form } = formHelpers
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const dueEndTime = useWatch({ control: form.control, name: 'dueEndTime' }) ?? ''
  const [endTimeExpanded, setShowEndTime] = useState<boolean | null>(null)
  const showEndTime = endTimeExpanded ?? Boolean(dueEndTime)
  const endTimeError = validateEndTime(dueTime, dueEndTime)
  const changeEndTime = (value: string) => {
    setShowEndTime(true)
    form.setValue('dueEndTime', value, { shouldDirty: true })
  }
  return <View style={{ gap: 12 }}>
          <TimeField disabled={disabled} label={t('habits.form.exactTime')} value={toTime24(dueTime)} onChange={guard(controller.setDueTime)} onClear={guard(controller.clearDueTime)} />
          {!dueTime ? <View><ListRow disabled={disabled} placement="field" title={t('habits.form.noSetTime')} expanded={showReminderQuestion} onClick={onTimeAnswered} /></View> : null}
          {dueTime ? <View><ListRow disabled={disabled} placement="field" title={t('habits.form.addEndTime')} expanded={showEndTime} onClick={guard(() => setShowEndTime(!showEndTime))} /></View> : null}
          {dueTime && showEndTime ? <TimeField disabled={disabled} label={t('habits.form.dueEndTime')} value={toTime24(dueEndTime)} error={endTimeError ? t(endTimeError) : undefined} onChange={guard(changeEndTime)} onClear={guard(() => changeEndTime(''))} /> : null}
        </View>
}

interface HabitReminderEditorsProps {
  tokens: ReturnType<typeof createTokensV2>
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
export function HabitFixedReminderEditors({ formHelpers, reminderTimes, onReminderTimesChange, showError, tokens }: Readonly<Omit<HabitReminderEditorsProps, 'controller'>>) {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { form, isGeneral } = formHelpers
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const scheduledReminders = useWatch({ control: form.control, name: 'scheduledReminders' }) ?? []
  const dueDate = useWatch({ control: form.control, name: 'dueDate' })
  const itemType = useWatch({ control: form.control, name: 'itemType' })
  if (isGeneral) return null
  const clockReminders = <ScheduledReminderSection tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} offsetReminderCount={dueTime ? reminderTimes.length : 0} hideDayBefore={itemType === 'task' && dueDate === getAccountDay(new Date(), profile?.timeZone)} onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })} onValidationError={showError} />
  if (!dueTime) return clockReminders
  return <ReminderSection tokens={tokens} reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={scheduledReminders.length} onValidationError={showError}>{clockReminders}</ReminderSection>
}

/** The reminder switch with its permission notice, the two reminder kinds and the editor of each kind. */
function HabitReminderEditors({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError, tokens }: Readonly<HabitReminderEditorsProps>) {
  const { profile } = useProfile()
  const { form, isGeneral } = formHelpers
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const repeatReminder = useWatch({ control: form.control, name: 'repeatReminder' })
  return <RepeatReminderSection value={repeatReminder} enabled={reminderEnabled} general={isGeneral} timeZone={profile?.timeZone} onToggle={() => controller.setReminderEnabled(!reminderEnabled)} onChange={(value) => changeHabitRepeatReminder(form, onReminderTimesChange, value)}>
    <HabitFixedReminderEditors formHelpers={formHelpers} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} tokens={tokens} />
  </RepeatReminderSection>
}

export function HabitTimingField({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError, tokens }: Readonly<HabitTimingFieldProps>) {
  const { t } = useTranslation()
  const { disabled } = useHabitFormInteraction()
  const { displayTime } = useTimeFormat()
  const { form, isGeneral } = formHelpers
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const [open, setOpen] = useState(false)
  const [timeAnswered, setTimeAnswered] = useState(false)
  const showReminderQuestion = isGeneral || Boolean(dueTime) || timeAnswered || reminderEnabled
  const { sheetRef, closeSheet } = useSheetHost()
  const summary = buildHabitTimingSummary({ ...form.getValues(), isGeneral }, reminderTimes, displayTime, t)
  return <>
    {/* eslint-disable-next-line local/max-button-words -- #1922 explicitly approves this timing-sheet entry label. */}
    <ListRow wrapTitle icon="bell" title={t('habits.form.timingAndReminder')} description={summary} placement="column" disabled={disabled} onClick={() => setOpen(true)} />
    {open ? <Sheet ref={sheetRef} open title={t('habits.form.timingAndReminder')} onClose={() => setOpen(false)} actions={<PillButton size="sm" onClick={() => closeSheet()}>{t('common.done')}</PillButton>}>
      <View testID="timing-levels" style={{ gap: 24, paddingBottom: 8 }}>
        {!isGeneral ? <HabitTimeQuestions formHelpers={formHelpers} controller={controller} showReminderQuestion={showReminderQuestion} onTimeAnswered={() => setTimeAnswered(true)} /> : null}
        {showReminderQuestion ? <HabitReminderEditors formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} tokens={tokens} /> : null}
      </View>
    </Sheet> : null}
  </>
}
