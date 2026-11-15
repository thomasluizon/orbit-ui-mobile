'use client'

import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { backendFormFieldFocusRequest } from '@orbit/shared/hooks'
import {
  buildHabitUnderstandingLabels,
  formatLocaleDate,
  habitFlowOptionalQuestions,
  isHabitDailySchedule,
  parseAPIDate,
  toTime24,
  type HabitFlowOptionalId,
  type HabitFlowStepKey,
} from '@orbit/shared/utils'
import { hasHabitMonthDaySchedule, MAX_HABIT_DESCRIPTION_LENGTH, validateEndTime } from '@orbit/shared/validation'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHasProAccess } from '@/hooks/use-profile'
import { DateField } from '@/components/ui/date-field'
import { X } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionRow } from '@/components/ui/question-row'
import { TimeField } from '@/components/ui/time-field'
import { useChecklistStepView } from '../flow-steps/checklist-step'
import { useGoalLinkStepView } from '../flow-steps/goal-link-step'
import { useTagStepView } from '../flow-steps/tag-step'
import { HabitMonthDaysField } from '../habit-form-fields/habit-month-days-field'
import { HabitScheduleFields } from '../habit-form-fields/habit-schedule-fields'
import { HabitRepeatInterval, ScheduleCorrections } from '../habit-form-fields/habit-understanding'
import { SlipAlertSection } from '../habit-form-fields/slip-alert-section'
import type { GuidedFlow, GuidedHabitFields } from './guided-step-views'
import { useReminderKindView } from './reminder-kind-step'

interface DetailInput {
  flow: GuidedFlow
  formHelpers: HabitFormHelpers
  fields: GuidedHabitFields
}

function useContinue(flow: GuidedFlow) {
  const t = useTranslations()
  return { label: t('habits.flow.continue'), onPress: () => flow.advance() }
}

function RepeatFree({ flow, formHelpers, fields }: Readonly<DetailInput>) {
  const t = useTranslations()
  const { form, daysList } = formHelpers
  const translate = useCallback((key: string, values?: Record<string, string | number | Date>) => t(key, values), [t])
  const frequencyUnit = form.watch('frequencyUnit') ?? null
  const isFlexible = form.watch('isFlexible') ?? false
  const days = form.watch('days') ?? []
  const quantity = form.watch('frequencyQuantity') ?? (frequencyUnit ? 0 : 3)
  const monthDays = form.watch('monthDays') ?? []
  const startDate = form.watch('dueDate') ?? ''
  const locked = fields.lockedGeneral === true
  const labels = buildHabitUnderstandingLabels(translate, form.watch('itemType'))
  const anchorDay = (startDate ? parseAPIDate(startDate) : new Date()).getDate()
  const { controller } = flow
  return <>
    <HabitScheduleFields hideMode unit={frequencyUnit} quantity={form.watch('frequencyQuantity') ?? null} flexible={isFlexible} disabled={locked} onModeChange={controller.setScheduleMode} onChange={controller.setSchedule} />
    <ScheduleCorrections days={days} daily={isHabitDailySchedule(days, isFlexible, frequencyUnit, quantity)} dayOptions={daysList} quantity={quantity} showCount={isFlexible && (!frequencyUnit || frequencyUnit === 'Week')} scheduleLocked={locked}
      onToggleDay={(day) => controller.toggleDay(day, isHabitDailySchedule(days, isFlexible, frequencyUnit, quantity), days)} onQuantityChange={controller.setQuantity} labels={labels} />
    <HabitMonthDaysField visible={hasHabitMonthDaySchedule({ frequencyUnit, isFlexible, isGeneral: formHelpers.isGeneral })} monthDays={monthDays} anchorDay={anchorDay} quantity={quantity} disabled={locked}
      onToggle={(day) => controller.toggleMonthDay(day, anchorDay, monthDays)} />
    <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={form.watch('intervalWeeks') ?? 1} scheduleLocked={locked} onIntervalWeeksChange={controller.setIntervalWeeks} labels={labels} />
    <DateField label={t('habits.form.habitStartDate')} value={startDate} onChange={(date) => form.setValue('dueDate', date, { shouldDirty: true })} />
  </>
}

function useRepeatView(input: DetailInput): FlowStepView {
  const t = useTranslations()
  const flexible = input.formHelpers.form.watch('isFlexible') ?? false
  return {
    question: t('habits.flow.repeat.question'),
    line: t('habits.flow.repeat.line'),
    options: <>
      <OptionCard label={t('habits.flow.repeat.everyN')} selected={!flexible} onSelect={() => input.flow.controller.setScheduleMode(false)} />
      <OptionCard label={t('habits.flow.repeat.timesIn')} selected={flexible} onSelect={() => input.flow.controller.setScheduleMode(true)} />
    </>,
    free: <RepeatFree {...input} />,
    primary: useContinue(input.flow),
  }
}

function useDurationView({ flow, formHelpers }: Readonly<DetailInput>): FlowStepView {
  const t = useTranslations()
  const { form } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const dueEndTime = form.watch('dueEndTime') ?? ''
  const error = validateEndTime(dueTime, dueEndTime)
  const setEnd = (value: string) => form.setValue('dueEndTime', value, { shouldDirty: true })
  return {
    question: t('habits.flow.duration.question'),
    line: null,
    options: <OptionCard label={t('habits.flow.duration.none')} selected={dueEndTime === ''} onSelect={() => { setEnd(''); flow.advance() }} />,
    free: <TimeField label={t('habits.form.dueEndTime')} value={toTime24(dueEndTime)} error={error ? t(error) : undefined} onChange={setEnd} onClear={() => setEnd('')} />,
    primary: { label: t('habits.flow.continue'), onPress: () => { if (!error) flow.advance() } },
  }
}

function useOptionalValues({ formHelpers, fields }: Readonly<Omit<DetailInput, 'flow'>>): Partial<Record<HabitFlowOptionalId, string>> {
  const t = useTranslations()
  const locale = useLocale()
  const { form } = formHelpers
  const count = (value: number) => (value > 0 ? String(value) : undefined)
  const endDate = form.watch('endDate') ?? ''
  return {
    description: form.watch('description') || undefined,
    checklist: count((form.watch('checklistItems') ?? []).length),
    avoid: form.watch('isBadHabit') ? t('habits.flow.optional.yes') : t('habits.flow.optional.no'),
    tags: count(fields.tags.selectedTagIds.length),
    goals: count(fields.selectedGoalIds.length),
    endDate: endDate ? formatLocaleDate(endDate, locale) : undefined,
  }
}

function useMoreView({ flow, formHelpers, fields }: Readonly<DetailInput>): FlowStepView {
  const t = useTranslations()
  const values = useOptionalValues({ formHelpers, fields })
  const rows = habitFlowOptionalQuestions({
    mode: flow.mode, isGeneral: formHelpers.isGeneral, canSplit: typeof fields.children === 'function',
    hasParent: Boolean(fields.parentField), canEnd: formHelpers.showEndDate,
  })
  return {
    question: t('habits.flow.more'),
    line: null,
    free: <div role="list" aria-label={t('habits.flow.more')} className="flex flex-col gap-3">
      {rows.map((id) => <div role="listitem" key={id}><QuestionRow question={t(`habits.flow.optional.${id}`)} value={values[id]} onPress={() => flow.open(`optional:${id}`)} /></div>)}
    </div>,
    primary: useContinue(flow),
  }
}

function useAvoidView({ flow, formHelpers }: Readonly<DetailInput>): FlowStepView {
  const t = useTranslations()
  const { form } = formHelpers
  const avoid = form.watch('isBadHabit') ?? false
  return {
    question: t('habits.flow.optional.avoid'),
    line: null,
    options: <>
      <OptionCard label={t('habits.flow.optional.yes')} selected={avoid} onSelect={() => { form.setValue('isBadHabit', true, { shouldDirty: true }); flow.replace('slipAlert') }} />
      <OptionCard label={t('habits.flow.optional.no')} selected={!avoid} onSelect={() => { form.setValue('isBadHabit', false, { shouldDirty: true }); flow.advance() }} />
    </>,
  }
}

function useSlipAlertView({ flow, formHelpers }: Readonly<DetailInput>): FlowStepView {
  const t = useTranslations()
  const hasProAccess = useHasProAccess()
  const enabled = formHelpers.form.watch('slipAlertEnabled') ?? false
  return {
    question: t('habits.flow.optional.slipAlert'),
    line: null,
    free: <SlipAlertSection inline hasProAccess={hasProAccess} slipAlertEnabled={enabled} onToggle={() => flow.controller.setSlipAlertEnabled(!enabled)} t={t} />,
    primary: useContinue(flow),
  }
}

function useEndDateView({ flow, formHelpers }: Readonly<DetailInput>): FlowStepView {
  const t = useTranslations()
  const { form } = formHelpers
  const endDate = form.watch('endDate') ?? ''
  const setEnd = (value: string) => form.setValue('endDate', value, { shouldDirty: true })
  return {
    question: t('habits.flow.optional.endDate'),
    line: null,
    options: <OptionCard label={t('habits.flow.optional.none')} selected={endDate === ''} onSelect={() => { setEnd(''); flow.advance() }} />,
    free: <div className="flex min-w-0 items-end gap-2">
      <div className="min-w-0 flex-1"><DateField label={t('habits.form.endDateQuestion')} value={endDate} placeholder={t('habits.form.endDatePlaceholder')} onChange={setEnd} /></div>
      {endDate ? <PillButton variant="ghost" iconOnly label={t('habits.flow.optional.removeEndDate')} onClick={() => setEnd('')}><X size={20} aria-hidden="true" /></PillButton> : null}
    </div>,
    primary: useContinue(flow),
  }
}

/** The hosted questions: each one keeps the current component of its field, unchanged, inside its own step. */
function useHostedViews({ flow, formHelpers, fields }: Readonly<DetailInput>): Partial<Record<HabitFlowStepKey, FlowStepView>> {
  const t = useTranslations()
  const { form } = formHelpers
  const primary = useContinue(flow)
  const view = (id: HabitFlowOptionalId, free: React.ReactNode): FlowStepView => ({ question: t(`habits.flow.optional.${id}`), line: null, free, primary })
  return {
    'optional:description': view('description', <Input label={t('habits.flow.optional.description')} hideLabel error={formHelpers.backendFieldErrors.description}
      focusRequest={backendFormFieldFocusRequest('description', formHelpers.backendFocusField, formHelpers.backendFocusRequest)}
      value={form.watch('description') ?? ''} onChange={(value) => form.setValue('description', value, { shouldDirty: true })} multiline rows={3} maxLength={MAX_HABIT_DESCRIPTION_LENGTH} />),
    'optional:subHabits': view('subHabits', typeof fields.children === 'function' ? fields.children(0) : fields.children),
    'optional:parent': view('parent', fields.parentField),
  }
}

/** The checklist, tag and goal questions: each step owns its quick options, its free path and its continue. The host mounts them on every render. */
function useRelationViews({ flow, formHelpers, fields }: Readonly<DetailInput>): Partial<Record<HabitFlowStepKey, FlowStepView>> {
  const { form } = formHelpers
  const title = form.watch('title')
  const next = () => flow.advance()
  return {
    'optional:checklist': useChecklistStepView({ items: form.watch('checklistItems') ?? [], onItemsChange: flow.controller.setChecklistItems,
      pendingItemText: fields.pendingChecklistItem, onPendingItemChange: fields.onPendingChecklistItemChange, onContinue: next }),
    'optional:tags': useTagStepView({ tags: fields.tags, title, description: form.watch('description') ?? '', onContinue: next }),
    'optional:goals': useGoalLinkStepView({ habitId: fields.habitId, habitTitle: title, selectedGoalIds: fields.selectedGoalIds, atGoalLimit: fields.atGoalLimit,
      onToggleGoal: fields.onToggleGoal, onGoalCreated: fields.onGoalCreated, onContinue: next }),
  }
}

/** Every step the summary or the optional list opens. Each one asks one question and returns to where it came from. */
export function useDetailViews(input: DetailInput): Partial<Record<HabitFlowStepKey, FlowStepView>> {
  return {
    repeat: useRepeatView(input),
    duration: useDurationView(input),
    reminderKind: useReminderKindView(input),
    more: useMoreView(input),
    'optional:avoid': useAvoidView(input),
    slipAlert: useSlipAlertView(input),
    'optional:endDate': useEndDateView(input),
    ...useHostedViews(input),
    ...useRelationViews(input),
  }
}
