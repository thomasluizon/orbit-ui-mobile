import type { HabitRecurrence } from '@orbit/shared/utils'
import { useHabitFormInteraction } from './habit-form-interaction'
import { useWatch } from 'react-hook-form'
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
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

function isDateCapacity(error: unknown): boolean {
  return isPayGateError(error) || extractBackendErrorCode(error) === 'AI_DAILY_BUDGET_EXCEEDED'
}

function DateCapacity({ visible, message }: Readonly<{ visible: boolean; message: string | null }>) {
  if (!visible || !message) return null
  return <CapacityNotice message={message} />
}

function DateConsultation({ snapshot }: Readonly<{ snapshot: ReturnType<HabitDateEditor['getSnapshot']> }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <>
    <DateCapacity visible={snapshot.capacity} message={snapshot.failure} />
    <Text accessibilityLiveRegion="polite" style={{ color: tokens.statusBadText, fontSize: 14, fontFamily: 'Geist_400Regular', ...(!snapshot.failure || snapshot.capacity ? { display: 'none' as const } : {}) }}>{snapshot.capacity ? '' : snapshot.failure ?? ''}</Text>
  </>
}

function TaskDateChoices({ formHelpers, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; lockedGeneral?: boolean | null; onChange?: () => void }>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const type = useWatch({ control: formHelpers.form.control, name: 'itemType' })
  if (type !== 'task') return null
  return <View style={{ minWidth: 0, gap: 8 }}>
      {formHelpers.isGeneral ? <Text style={{ color: tokens.fg2, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{t('habits.form.datePhrase')}</Text> : null}
      <RadioGroup accessibilityLabel={t('habits.form.datePhrase')}>
        <RadioRow label={t('habits.form.taskDate')} selected={!formHelpers.isGeneral} {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : lockedGeneral === true ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={guard(() => { onChange?.(); formHelpers.setOneTime() })} />
        <RadioRow label={t('habits.form.noSchedule')} selected={formHelpers.isGeneral} {...(disabled ? { disabled: true as const, reasonScope: 'group' as const } : lockedGeneral === false ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={guard(() => { onChange?.(); formHelpers.setGeneral() })} />
      </RadioGroup>
    </View>
}

export function HabitDateField({ formHelpers, onRecurrence, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; onRecurrence: (schedule: HabitRecurrence) => void; lockedGeneral?: boolean | null; onChange?: () => void }>) {
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const allowanceText = createAstraAllowanceTranslator(t, profile, locale)
  const { isOnline } = useOffline()
  const interpretation = useDateInterpretation()
  const { form, registerDateValidation } = formHelpers
  const phrase = useWatch({ control: form.control, name: 'datePhrase' }) ?? ''
  const date = useWatch({ control: form.control, name: 'dueDate' }) ?? ''
  const issue = useWatch({ control: form.control, name: 'dateIssue' }) ?? ''
  const type = useWatch({ control: form.control, name: 'itemType' })
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
      if (isDisabled()) return
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
  useEffect(() => { if (!disabled) editor.open(); else editor.close(); return () => editor.close() }, [disabled, editor])
  useEffect(() => { editor.initializeDate() }, [date, editor, formHelpers.isGeneral, timeZone])
  const dateLabel = t(type === 'habit' ? 'habits.form.habitStartDate' : 'habits.form.taskDate')
  const validationError = form.formState.errors.datePhrase?.message
  const error = issue || validationError
  return <View style={{ minWidth: 0, gap: 16 }}>
    {!formHelpers.isGeneral ? <Input disabled={disabled} label={t('habits.form.datePhrase')} placeholder={t('habits.form.datePhrasePlaceholder')} trailing={snapshot.pending || snapshot.astra ? <View accessible accessibilityLabel={t(snapshot.pending ? 'habits.form.dateInterpreting' : 'habits.form.dateInterpreted')} accessibilityState={{ busy: snapshot.pending }}><AstraGlyph size={16} color={tokens.fg3} /></View> : undefined} name="datePhrase" autoComplete="off" value={phrase} error={error ? t(error) : undefined} focusRequest={validationError && issue !== 'habits.form.recurrenceRequiresHabit' ? formHelpers.validationFocusRequest : undefined} onChange={guard((value) => editor.setPhrase(value))} /> : null}
    <TaskDateChoices formHelpers={formHelpers} lockedGeneral={lockedGeneral} onChange={onChange} />
    {!formHelpers.isGeneral ? <View style={{ minWidth: 0, gap: 8 }}>
      {type === 'habit' ? <Text style={{ color: tokens.fg2, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{dateLabel}</Text> : null}
      <DateField disabled={disabled} label={dateLabel} value={date} onChange={guard((value) => editor.selectDate(value))} />
    </View> : null}
    <DateConsultation snapshot={snapshot} />
  </View>
}

