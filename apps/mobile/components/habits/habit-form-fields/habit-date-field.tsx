import { useWatch } from 'react-hook-form'
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
import { ActionRow } from '@/components/ui/action-row'
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

function DateConsultation({ editor, snapshot }: Readonly<{ editor: HabitDateEditor; snapshot: ReturnType<HabitDateEditor['getSnapshot']> }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  if (snapshot.candidate) return null
  const atLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, profile?.aiMessagesLimit ?? 5)
  const canAsk = snapshot.status === 'unsupported'
  return <>
    <DateCapacity visible={snapshot.capacity} message={snapshot.failure} />
    {canAsk ? <View style={{ alignItems: 'flex-start', gap: 16 }}>
      {atLimit ? <CapacityNotice message={t('habits.form.aiSuggestLimitReached')} /> : null}
      {!isOnline ? <CapacityNotice message={t('shell.composer.offline.reason')} /> : null}
      <PillButton variant="ghost" disabled={!isOnline || atLimit || snapshot.pending || snapshot.capacity} loading={snapshot.pending} onClick={() => void editor.ask(isOnline, atLimit)}>{t('habits.form.askDate')}</PillButton>
      <Text style={{ color: tokens.fg3, fontSize: 12, fontFamily: 'Geist_400Regular' }}>{t('habits.form.askAstraCost', { allowance: profile?.aiMessagesLimit ?? 5 })}</Text>
    </View> : null}
    <Text accessibilityLiveRegion="polite" style={{ color: tokens.statusBadText, fontSize: 14, fontFamily: 'Geist_400Regular' }}>{snapshot.capacity ? '' : snapshot.failure ?? ''}</Text>
  </>
}

function DatedHabitField({ formHelpers }: Readonly<{ formHelpers: HabitFormHelpers }>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const interpretation = useDateInterpretation()
  const { form, registerDateValidation } = formHelpers
  const phrase = useWatch({ control: form.control, name: 'datePhrase' }) ?? ''
  const date = useWatch({ control: form.control, name: 'dueDate' }) ?? ''
  const issue = useWatch({ control: form.control, name: 'dateIssue' }) ?? ''
  const type = useWatch({ control: form.control, name: 'itemType' })
  const timeZone = profile?.timeZone
  const [dateFocusRequest, setDateFocusRequest] = useState(0)
  const context = () => {
    const values = form.getValues()
    return { account: getAccountGeneration(), locale, timeZone,
      referenceDate: timeZone === undefined ? '' : getAccountDay(new Date(), timeZone),
      type: values.itemType, schedule: resolveHabitFormMode({ isGeneral: values.isGeneral ?? false, isFlexible: values.isFlexible ?? false, frequencyUnit: values.frequencyUnit ?? null }),
      cadence: { unit: values.frequencyUnit ?? null, quantity: values.frequencyQuantity ?? null, days: [...new Set(values.days ?? [])].sort((left, right) => left.localeCompare(right)), intervalWeeks: values.intervalWeeks ?? 1 },
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
    if (!formHelpers.isGeneral && !date && timeZone !== undefined) {
      form.register('dueDate')
      form.resetField('dueDate', { defaultValue: getAccountDay(new Date(), timeZone) })
    }
  }, [date, form, formHelpers.isGeneral, timeZone])
  const dateLabel = t(type === 'habit' ? 'habits.form.habitStartDate' : 'habits.form.taskDate')
  const validationError = form.formState.errors.datePhrase?.message
  const error = issue || validationError
  const accept = () => { editor.accept(); setDateFocusRequest((request) => request + 1) }
  if (formHelpers.isGeneral) return null
  return <View style={{ minWidth: 0, gap: 16 }}>
    <Input label={t('habits.form.datePhrase')} hint={t(type === 'habit' ? 'habits.form.habitDateQuestion' : 'habits.form.taskDateQuestion')} name="datePhrase" autoComplete="off" value={phrase} error={error ? t(error) : undefined} focusRequest={validationError ? formHelpers.validationFocusRequest : undefined} onChange={(value) => editor.setPhrase(value)} />
    <View style={{ minWidth: 0, gap: 8 }}>
      <Text style={{ color: tokens.fg2, fontSize: 14, fontFamily: 'Geist_500Medium' }}>{dateLabel}</Text>
      <Proposed keepMounted inset proposed={Boolean(snapshot.candidate)} scope="field" label={t('habits.form.dateProposed')}>
        <DateField appearance={snapshot.candidate ? 'proposed' : 'normal'} label={dateLabel} value={snapshot.candidate ?? date} onChange={(value) => editor.selectDate(value)} focusRequest={dateFocusRequest} />
      </Proposed>
      <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg3, fontSize: 14, fontFamily: 'Geist_400Regular', lineHeight: 21 }}>{snapshot.candidate ? t('habits.form.dateProposed') : date ? t('common.selectedDate', { date: formatLocaleDate(date, locale) }) : ''}</Text>
    </View>
    {snapshot.candidate ? <ActionRow><PillButton variant="ghost" onClick={accept}>{t('habits.form.acceptDate')}</PillButton></ActionRow> : null}
    <DateConsultation editor={editor} snapshot={snapshot} />
  </View>
}

export function HabitDateField({ formHelpers }: Readonly<{ formHelpers: HabitFormHelpers }>) {
  return <DatedHabitField formHelpers={formHelpers} />
}
