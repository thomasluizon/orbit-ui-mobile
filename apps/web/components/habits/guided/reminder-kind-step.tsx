'use client'

import { useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { RepeatReminderOptions } from '@orbit/shared/types/habit'
import { startRepeatReminder } from '@orbit/shared/utils/repeat-reminders'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { OptionCard } from '@/components/ui/option-card'
import { changeHabitRepeatReminder, HabitFixedReminderEditors } from '../habit-form-fields/habit-timing-field'
import { ReminderPermissionNotice } from '../habit-form-fields/reminder-permission-notice'
import { RepeatReminderFields } from '../habit-form-fields/repeat-reminder-section'
import type { GuidedFlow, GuidedHabitFields } from './guided-step-views'

interface ReminderKindInput {
  flow: GuidedFlow
  formHelpers: HabitFormHelpers
  fields: GuidedHabitFields
}

/**
 * The reminder question the summary opens. Each kind is one quick option, and the editor of the chosen kind is the free path.
 * An undated item has no reminder at a set time, so it shows the repeat only.
 */
export function useReminderKindView({ flow, formHelpers, fields }: Readonly<ReminderKindInput>): FlowStepView {
  const t = useTranslations()
  const { showError } = useAppToast()
  const { profile } = useProfile()
  const { form, isGeneral } = formHelpers
  const enabled = form.watch('reminderEnabled') ?? false
  const repeat = form.watch('repeatReminder') ?? null
  const permission = useReminderPermission(enabled, () => flow.controller.setReminderEnabled(!enabled))
  const changeRepeat = (value: RepeatReminderOptions | null) => changeHabitRepeatReminder(form, fields.onReminderTimesChange, value)
  const choose = (wantsRepeat: boolean) => {
    if (wantsRepeat && !repeat) changeRepeat(startRepeatReminder())
    if (!wantsRepeat && repeat) changeRepeat(null)
    if (!enabled) permission.toggleReminder()
  }
  const decline = () => {
    if (enabled) permission.toggleReminder()
    flow.advance()
  }
  const editor = repeat
    ? <RepeatReminderFields value={repeat} timeZone={profile?.timeZone} onChange={changeRepeat} />
    : <HabitFixedReminderEditors formHelpers={formHelpers} reminderTimes={fields.reminderTimes} onReminderTimesChange={fields.onReminderTimesChange} showError={showError} />
  return {
    question: t('habits.flow.reminderKind.question'),
    line: null,
    options: <>
      {isGeneral ? null : <OptionCard label={t('habits.flow.reminderKind.scheduled')} selected={enabled && !repeat} onSelect={() => choose(false)} />}
      <OptionCard label={t('habits.flow.reminderKind.repeat')} selected={enabled && Boolean(repeat)} onSelect={() => choose(true)} />
      <OptionCard label={t('habits.flow.reminder.no')} selected={!enabled} onSelect={decline} />
    </>,
    free: enabled ? <><ReminderPermissionNotice visible={permission.showNotice} t={t} />{editor}</> : undefined,
    primary: { label: t('habits.flow.continue'), onPress: () => flow.advance() },
  }
}
