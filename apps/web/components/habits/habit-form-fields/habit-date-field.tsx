'use client'

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { HabitDateEditor, isPayGateError, extractBackendErrorCode, getAccountDay, formatLocaleDate, getFriendlyErrorMessage, isHabitAstraLimitReached, resolveHabitFormMode } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useDateInterpretation } from '@/hooks/use-date-interpretation'
import { getAccountGeneration } from '@/lib/session-epoch'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Proposed } from '@/components/ui/proposed'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { useLocale, useTranslations } from 'next-intl'

function isDateCapacity(error: unknown): boolean {
  return isPayGateError(error) || extractBackendErrorCode(error) === 'AI_DAILY_BUDGET_EXCEEDED'
}

function DateCapacity({ visible, message }: Readonly<{ visible: boolean; message: string | null }>) {
  if (!visible || !message) return null
  return <CapacityNotice message={message} />
}

function DatedHabitField({ formHelpers }: Readonly<{ formHelpers: HabitFormHelpers }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const interpretation = useDateInterpretation()
  const { form, registerDateValidation } = formHelpers
  const phrase = form.watch('datePhrase') ?? ''
  const date = form.watch('dueDate') ?? ''
  const issue = form.watch('dateIssue') ?? ''
  const type = form.watch('itemType')
  const timeZone = profile?.timeZone
  const [dateFocusRequest, setDateFocusRequest] = useState(0)
  const context = () => {
    const values = form.getValues()
    return { account: getAccountGeneration(), locale, timeZone,
      referenceDate: timeZone === undefined ? '' : getAccountDay(new Date(), timeZone),
      type: values.itemType, schedule: resolveHabitFormMode({ isGeneral: values.isGeneral ?? false, isFlexible: values.isFlexible ?? false, frequencyUnit: values.frequencyUnit ?? null }),
      date: values.dueDate ?? '', endDate: values.endDate ?? '', phrase: values.datePhrase ?? '' }
  }
  const adapter = { context,
    write: (field: 'dueDate' | 'datePhrase' | 'dateIssue', value: string) => {
      form.setValue(field, value, { shouldDirty: true })
      form.clearErrors('datePhrase')
    },
    request: (input: { phrase: string; language: string }, signal: AbortSignal) => interpretation.mutateAsync({ ...input, signal }),
    failure: (error: unknown) => extractBackendErrorCode(error) === 'AI_DAILY_BUDGET_EXCEEDED' ? t('habits.form.dateBudgetReached') : getFriendlyErrorMessage(error, t, 'habits.form.aiSuggestError', 'habit'),
    isCapacity: isDateCapacity,
  }
  const [editor] = useState(() => new HabitDateEditor(adapter))
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  useLayoutEffect(() => { editor.configure(adapter); editor.sync() })
  useLayoutEffect(() => registerDateValidation(() => editor.validate()), [editor, registerDateValidation])
  useEffect(() => { editor.open(); return () => editor.close() }, [editor])
  useEffect(() => {
    if (!date && timeZone !== undefined) {
      form.register('dueDate')
      form.resetField('dueDate', { defaultValue: getAccountDay(new Date(), timeZone) })
    }
  }, [date, form, timeZone])
  const atLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, profile?.aiMessagesLimit ?? 5)
  const dateLabel = t(type === 'habit' ? 'habits.form.habitStartDate' : 'habits.form.taskDate')
  const canAsk = snapshot.status === 'unsupported'
  const validationError = form.formState.errors.datePhrase?.message
  const error = issue || validationError
  const accept = () => { editor.accept(); setDateFocusRequest((request) => request + 1) }
  return <section data-habit-date-field="" className="flex min-w-0 flex-col gap-4">
    <Input label={t('habits.form.datePhrase')} hint={t(type === 'habit' ? 'habits.form.habitDateQuestion' : 'habits.form.taskDateQuestion')} name="datePhrase" autoComplete="off" value={phrase} error={error ? t(error) : undefined} focusRequest={validationError ? formHelpers.validationFocusRequest : undefined} onChange={(value) => editor.setPhrase(value)} />
    <div className="flex min-w-0 flex-col gap-2">
      <span className="form-label">{dateLabel}</span>
      <Proposed keepMounted inset proposed={Boolean(snapshot.candidate)} scope="field" label={t('habits.form.dateProposed')}>
        <DateField label={dateLabel} value={snapshot.candidate ?? date} onChange={(value) => editor.selectDate(value)} focusRequest={dateFocusRequest} />
      </Proposed>
      <p role="status" className="text-sm leading-[1.5] text-[var(--fg-3)]">{snapshot.candidate ? t('habits.form.dateProposed') : date ? t('common.selectedDate', { date: formatLocaleDate(date, locale) }) : ''}</p>
    </div>
    {snapshot.candidate ? <PillButton variant="ghost" onClick={accept}>{t('habits.form.acceptDate')}</PillButton> : null}
    <DateCapacity visible={snapshot.capacity} message={snapshot.failure} />
    {canAsk ? <div className="flex min-w-0 flex-col items-start gap-4">
      {atLimit ? <CapacityNotice message={t('habits.form.aiSuggestLimitReached')} /> : null}
      {!isOnline ? <CapacityNotice message={t('shell.composer.offline.reason')} /> : null}
      <PillButton variant="ghost" disabled={!isOnline || atLimit || snapshot.pending || snapshot.capacity} loading={snapshot.pending} onClick={() => void editor.ask(isOnline, atLimit)}>{t('habits.form.askDate')}</PillButton>
      <p className="text-xs text-[var(--fg-3)]">{t('habits.form.askAstraCost', { allowance: profile?.aiMessagesLimit ?? 5 })}</p>
    </div> : null}
    <p aria-live="polite" className="text-sm text-[var(--status-bad-text)]">{snapshot.capacity ? '' : snapshot.failure ?? ''}</p>
  </section>
}

export function HabitDateField({ formHelpers }: Readonly<{ formHelpers: HabitFormHelpers }>) {
  if (formHelpers.isGeneral) return null
  return <DatedHabitField formHelpers={formHelpers} />
}
