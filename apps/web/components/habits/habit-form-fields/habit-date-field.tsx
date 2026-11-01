'use client'

import type { HabitRecurrence } from '@orbit/shared/utils'

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createAstraAllowanceTranslator, HabitDateEditor, isPayGateError, extractBackendErrorCode, getAccountDay, getFriendlyErrorMessage, isHabitAstraLimitReached, resolveHabitFormMode } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useDateInterpretation } from '@/hooks/use-date-interpretation'
import { getAccountGeneration } from '@/lib/session-epoch'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useLocale, useTranslations } from 'next-intl'

function isDateCapacity(error: unknown): boolean {
  return isPayGateError(error) || extractBackendErrorCode(error) === 'AI_DAILY_BUDGET_EXCEEDED'
}

function DateCapacity({ visible, message }: Readonly<{ visible: boolean; message: string | null }>) {
  if (!visible || !message) return null
  return <CapacityNotice message={message} />
}

function DateConsultation({ snapshot }: Readonly<{ snapshot: ReturnType<HabitDateEditor['getSnapshot']> }>) {
  return <>
    <DateCapacity visible={snapshot.capacity} message={snapshot.failure} />
    <p aria-live="polite" className="empty:hidden text-sm text-[var(--status-bad-text)]">{snapshot.capacity ? '' : snapshot.failure ?? ''}</p>
  </>
}

function TaskDateChoices({ formHelpers, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; lockedGeneral?: boolean | null; onChange?: () => void }>) {
  const t = useTranslations()
  if (formHelpers.form.watch('itemType') !== 'task') return null
  return <div className="flex min-w-0 flex-col gap-2">
      {formHelpers.isGeneral ? <span className="form-label">{t('habits.form.datePhrase')}</span> : null}
      <RadioGroup aria-label={t('habits.form.datePhrase')}>
        <RadioRow label={t('habits.form.taskDate')} selected={!formHelpers.isGeneral} {...(lockedGeneral === true ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={() => { onChange?.(); formHelpers.setOneTime() }} />
        <RadioRow label={t('habits.form.noSchedule')} selected={formHelpers.isGeneral} {...(lockedGeneral === false ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={() => { onChange?.(); formHelpers.setGeneral() }} />
      </RadioGroup>
    </div>
}

export function HabitDateField({ formHelpers, onRecurrence, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; onRecurrence: (schedule: HabitRecurrence) => void; lockedGeneral?: boolean | null; onChange?: () => void }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const allowanceText = createAstraAllowanceTranslator(t, profile, locale)
  const { isOnline } = useOffline()
  const interpretation = useDateInterpretation()
  const { form, registerDateValidation } = formHelpers
  const phrase = form.watch('datePhrase') ?? ''
  const date = form.watch('dueDate') ?? ''
  const issue = form.watch('dateIssue') ?? ''
  const type = form.watch('itemType')
  const timeZone = profile?.timeZone
  const context = () => {
    const values = form.getValues()
    return { account: getAccountGeneration(), locale, timeZone,
      referenceDate: timeZone === undefined ? '' : getAccountDay(new Date(), timeZone),
      type: values.itemType, schedule: resolveHabitFormMode({ isGeneral: values.isGeneral ?? false, isFlexible: values.isFlexible ?? false, frequencyUnit: values.frequencyUnit ?? null }),
      cadence: { unit: values.frequencyUnit ?? null, quantity: values.frequencyQuantity ?? null, days: [...new Set(values.days ?? [])].sort((left, right) => left.localeCompare(right)), intervalWeeks: values.intervalWeeks ?? 1 },
      date: values.dueDate ?? '', endDate: values.endDate ?? '', phrase: values.datePhrase ?? '' }
  }
  const adapter = { context, owner: form, generalLocked: lockedGeneral === true, applyRecurrence: onRecurrence,
    initializeDate: (value: string) => {
      form.register('dueDate')
      form.resetField('dueDate', { defaultValue: value })
    },
    write: (field: 'dueDate' | 'datePhrase' | 'dateIssue', value: string) => {
      form.setValue(field, value, { shouldDirty: true })
      form.clearErrors('datePhrase')
    },
    request: (input: { phrase: string; language: string }, signal: AbortSignal) => interpretation.mutateAsync({ ...input, signal }),
    failure: (error: unknown) => extractBackendErrorCode(error) === 'AI_DAILY_BUDGET_EXCEEDED' ? t('habits.form.dateBudgetReached') : getFriendlyErrorMessage(error, allowanceText, 'habits.form.aiSuggestError', 'habit'),
    isCapacity: isDateCapacity,
  }
  const [editor] = useState(() => new HabitDateEditor(adapter))
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  useLayoutEffect(() => { editor.configure(adapter); editor.sync(); editor.setAvailability(isOnline, isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, profile?.aiMessagesLimit ?? 5)) })
  useLayoutEffect(() => registerDateValidation(() => editor.validate(), () => editor.chooseType()), [editor, registerDateValidation])
  useEffect(() => { editor.open(); return () => editor.close() }, [editor])
  useEffect(() => { editor.initializeDate() }, [date, editor, formHelpers.isGeneral, timeZone])
  const dateLabel = t(type === 'habit' ? 'habits.form.habitStartDate' : 'habits.form.taskDate')
  const validationError = form.formState.errors.datePhrase?.message
  const error = issue || validationError
  return <section data-habit-date-field="" className="flex min-w-0 flex-col gap-4">
    {!formHelpers.isGeneral ? <Input label={t('habits.form.datePhrase')} placeholder={t('habits.form.datePhrasePlaceholder')} trailing={snapshot.pending || snapshot.astra ? <span role="status" aria-label={t(snapshot.pending ? 'habits.form.dateInterpreting' : 'habits.form.dateInterpreted')}><AstraGlyph size={16} color="var(--fg-3)" /></span> : undefined} name="datePhrase" autoComplete="off" value={phrase} error={error ? t(error) : undefined} focusRequest={validationError && issue !== 'habits.form.recurrenceRequiresHabit' ? formHelpers.validationFocusRequest : undefined} onChange={(value) => editor.setPhrase(value)} /> : null}
    <TaskDateChoices formHelpers={formHelpers} lockedGeneral={lockedGeneral} onChange={onChange} />
    {!formHelpers.isGeneral ? <div className="flex min-w-0 flex-col gap-2">
      {type === 'habit' ? <span className="form-label">{dateLabel}</span> : null}
      <DateField label={dateLabel} value={date} onChange={(value) => editor.selectDate(value)} />
    </div> : null}
    <DateConsultation snapshot={snapshot} />
  </section>
}

