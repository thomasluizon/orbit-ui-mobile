'use client'

import { useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'
import { buildHabitUnderstandingSentence, describeHabitFlowSummary, phraseLineKey, summaryValueStep, toTime24, HABIT_TIME_OPTIONS, type HabitFlowAnswerFields, type HabitFormCommonProps } from '@orbit/shared/utils'
import { MAX_HABIT_TITLE_LENGTH } from '@orbit/shared/validation'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { useTimeFormat } from '@/hooks/use-time-format'
import { DateField } from '@/components/ui/date-field'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { PrimaryActionSlot } from '@/components/ui/primary-action-slot'
import { Proposed } from '@/components/ui/proposed'
import { QuestionRow } from '@/components/ui/question-row'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeField } from '@/components/ui/time-field'
import { HabitEmojiSelector } from '../habit-form-fields/habit-emoji-selector'
import { HabitTypeField } from '../habit-form-fields/habit-type-field'
import { PhraseField } from './phrase-field'
import type { useGuidedHabitFlow } from './use-guided-habit-flow'

export type GuidedFlow = ReturnType<typeof useGuidedHabitFlow>

/** The inputs of every detail question: the same props the full form takes, so both views share one form state. */
export type GuidedHabitFields = Omit<HabitFormCommonProps<HabitFormHelpers, TagSelectionState, ReactNode>, 'formHelpers'> & HabitFlowAnswerFields

export interface GuidedHabitCompletion {
  stepCount: number
  usedAiRead: boolean
}

export interface GuidedHabitFlowProps {
  mode?: 'create' | 'edit'
  formHelpers: HabitFormHelpers
  fields: GuidedHabitFields
  lockedGeneral: boolean | null
  fromConversation: boolean
  pending: boolean
  /** An edit whose stored details still load. The summary shows a skeleton for each row and the save stays off. */
  detailsLoading?: boolean
  /** An edit whose stored details did not load. The summary states it with a retry and the save stays off. */
  detailsError?: { message: string; onRetry: () => void } | null
  /** The server message of a failed save. The flow stays on the summary. */
  saveError: string | null
  /** The capacity, Pro or offline notice of a refused save. It shows on the summary. */
  notice?: ReactNode
  createLabel: string
  onSubmit: (completion: GuidedHabitCompletion) => void
  onClose: () => void
}

interface ViewInput {
  flow: GuidedFlow
  formHelpers: HabitFormHelpers
}

function usePhraseParts({ flow, formHelpers }: Readonly<ViewInput>): string | null {
  const t = useTranslations()
  const locale = useLocale()
  const { form, daysList } = formHelpers
  if (flow.mode !== 'create' || flow.localRead.consumed.length === 0) return null
  const translate = (key: string, values?: Record<string, string | number | Date>) => t(key, values)
  const parts = buildHabitUnderstandingSentence(form.watch('days') ?? [], daysList, form.watch('isFlexible') ?? false, form.watch('frequencyUnit'), form.watch('frequencyQuantity') ?? 1,
    form.watch('dueTime') ?? '', locale, translate, form.watch('intervalWeeks') ?? 1, form.watch('monthDays') ?? [])
  return parts ? `${parts.charAt(0).toLocaleLowerCase(locale)}${parts.slice(1)}` : null
}

export function usePhraseView({ flow, formHelpers }: Readonly<ViewInput>): FlowStepView {
  const t = useTranslations()
  const { form } = formHelpers
  const title = form.watch('title')
  const [hint, setHint] = useState<string | undefined>()
  const [focusRequest, setFocusRequest] = useState(0)
  const parts = usePhraseParts({ flow, formHelpers })
  const serverError = resolveBackendFormFieldMessage(formHelpers.backendFieldErrors.title, form.formState.errors.title?.message, t)
  const submit = () => {
    if (title.trim().length === 0) { setHint(t('habits.flow.what.hint')); setFocusRequest((request) => request + 1); return }
    void flow.leavePhrase()
  }
  return {
    question: t('habits.flow.what.question'),
    line: flow.offline ? t('habits.flow.orbit.offline') : t(phraseLineKey(title, parts !== null), { parts: parts ?? '' }),
    free: <PhraseField label={t('habits.flow.what.label')} value={title} placeholder={t('habits.flow.what.placeholder')} maxLength={MAX_HABIT_TITLE_LENGTH} hint={hint ?? serverError}
      marks={flow.mode === 'create' ? flow.localRead.consumed : []} marksLabel={t('habits.form.understood')}
      focusRequest={focusRequest || backendFormFieldFocusRequest('title', formHelpers.backendFocusField, formHelpers.backendFocusRequest)}
      onChange={(value) => { setHint(undefined); flow.changeTitle(value) }} onSubmit={submit} />,
    primary: { label: t('habits.flow.continue'), onPress: submit, loading: flow.reading },
  }
}

export function useWhenView({ flow, formHelpers }: Readonly<ViewInput>): FlowStepView {
  const t = useTranslations()
  const [text, setText] = useState('')
  const [issue, setIssue] = useState<string | undefined>()
  const dueDate = formHelpers.form.watch('dueDate') ?? ''
  const submitText = () => {
    const refusal = flow.readWhenWords(text)
    setIssue(refusal ? t(refusal === 'past' ? 'habits.flow.when.past' : 'habits.flow.when.unresolved') : undefined)
  }
  return {
    question: t('habits.flow.when.question'),
    line: t('habits.flow.when.line'),
    options: <>
      <OptionCard label={t('habits.flow.when.today')} onSelect={() => flow.answerWhen('today')} />
      <OptionCard label={t('habits.flow.when.tomorrow')} onSelect={() => flow.answerWhen('tomorrow')} />
      <OptionCard label={t('habits.flow.when.everyDay')} onSelect={() => flow.answerWhen('everyDay')} />
      <OptionCard label={t('habits.flow.when.noDate')} onSelect={() => flow.answerWhen('noDate')} />
    </>,
    free: <>
      <Input label={t('habits.flow.when.freeLabel')} name="datePhrase" value={text} placeholder={t('habits.flow.when.freePlaceholder')} error={issue} onChange={(value) => { setText(value); setIssue(undefined) }} onSubmit={submitText} />
      <DateField label={t('habits.flow.when.calendar')} value={dueDate} minDate={flow.mode === 'create' ? flow.today : undefined} onChange={(date) => { if (date) flow.chooseDate(date) }} />
      <PrimaryActionSlot><PillButton variant="ghost" onClick={submitText}>{t('habits.flow.continue')}</PillButton></PrimaryActionSlot>
    </>,
  }
}

export function useTimeView({ flow, formHelpers }: Readonly<ViewInput>): FlowStepView {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const dueTime = formHelpers.form.watch('dueTime') ?? ''
  return {
    question: t('habits.flow.time.question'),
    line: t('habits.flow.time.line'),
    options: <>
      {HABIT_TIME_OPTIONS.map((time) => <OptionCard key={time} label={displayTime(time)} selected={dueTime === time} onSelect={() => flow.answerTime(time)} />)}
      <OptionCard label={t('habits.flow.time.none')} onSelect={() => flow.answerTime(null)} />
    </>,
    free: <TimeField label={t('habits.flow.time.freeLabel')} value={toTime24(dueTime)} onChange={flow.answerTime} onClear={() => flow.answerTime(null)} />,
  }
}

export function useReminderView({ flow, formHelpers }: Readonly<ViewInput>): FlowStepView {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  return {
    question: t('habits.flow.reminder.question', { time: displayTime(formHelpers.form.watch('dueTime') ?? '') }),
    line: t('habits.flow.reminder.line'),
    options: <>
      <OptionCard label={t('habits.flow.reminder.yes')} onSelect={() => flow.answerReminder(true)} />
      <OptionCard label={t('habits.flow.reminder.no')} onSelect={() => flow.answerReminder(false)} />
    </>,
  }
}

export function useTypeView({ flow, formHelpers, lockedGeneral }: Readonly<ViewInput & { lockedGeneral: boolean | null }>): FlowStepView {
  const t = useTranslations()
  return {
    question: t('habits.flow.type.question'),
    line: t('habits.flow.type.line'),
    free: <HabitTypeField formHelpers={{ ...formHelpers, chooseItemType: flow.chooseItemType }} lockedGeneral={lockedGeneral} onChange={(type) => { flow.markTypeDeliberate(type); flow.advance() }} />,
  }
}

function SummaryTitle({ flow, formHelpers }: Readonly<ViewInput>) {
  const t = useTranslations()
  const { form } = formHelpers
  const title = form.watch('title')
  return (
    <div className="flex min-w-0 items-center gap-3">
      <HabitEmojiSelector selectedEmoji={form.watch('emoji') ?? ''} onSelect={flow.chooseEmoji} proposed={flow.proposals.emoji}
        onSuggest={() => void flow.suggestEmoji()} canSuggest={title.trim().length > 0 && !flow.offline} isSuggesting={flow.reading} />
      <div className="min-w-0 flex-1"><QuestionRow question={t('habits.flow.summary.title')} value={title} onPress={() => flow.open('what')} /></div>
    </div>
  )
}

function useSummaryValues(formHelpers: HabitFormHelpers) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  return describeHabitFlowSummary({ ...formHelpers.form.watch(), isGeneral: formHelpers.isGeneral }, { translate: (key, values) => t(key, values), locale, displayTime })
}

const SUMMARY_SKELETON_ROWS = ['title', 'type', 'when', 'time', 'reminder', 'more'] as const

function SummarySkeleton() {
  const t = useTranslations()
  return (
    <div role="progressbar" aria-busy="true" aria-label={t('common.loading')} data-summary-skeleton="" className="flex flex-col gap-3">
      {SUMMARY_SKELETON_ROWS.map((row) => <div key={row} className="h-12 overflow-hidden rounded-[12px]"><Skeleton variant="fill" grouped /></div>)}
    </div>
  )
}

function SummaryRows({ flow, formHelpers, props }: Readonly<ViewInput & { props: GuidedHabitFlowProps }>) {
  const t = useTranslations()
  const { form } = formHelpers
  const values = useSummaryValues(formHelpers)
  const item = { itemType: form.watch('itemType'), isGeneral: formHelpers.isGeneral }
  const proposedLabel = t('habits.detail.proposed')
  const whenLocked = props.lockedGeneral === true
  const row = (key: string, label: string, value: string, onClick?: () => void) =>
    <ListRow key={key} placement="field" title={label} value={value} disabled={!onClick} description={!onClick ? t('common.locked') : undefined} onClick={onClick} />
  return <>
    <SummaryTitle flow={flow} formHelpers={formHelpers} />
    <QuestionRow question={t('habits.flow.summary.type')} value={values.type} onPress={() => flow.open('type')} />
    <Proposed proposed={flow.proposals.schedule} scope="row" label={proposedLabel}>{row('when', t('habits.flow.summary.when'), values.when, whenLocked ? undefined : () => flow.open(summaryValueStep('when', item)))}</Proposed>
    {formHelpers.isGeneral ? null : <>
      <Proposed proposed={flow.proposals.time} scope="row" label={proposedLabel}>{row('time', t('habits.flow.summary.time'), values.time, () => flow.open('time'))}</Proposed>
      {values.timed ? row('duration', t('habits.flow.summary.duration'), values.duration, () => flow.open('duration')) : null}
    </>}
    {row('reminder', t('habits.flow.summary.reminder'), values.reminder, () => flow.open(summaryValueStep('reminder', item)))}
  </>
}

export function useSummaryView({ flow, formHelpers, props }: Readonly<ViewInput & { props: GuidedHabitFlowProps }>): FlowStepView {
  const t = useTranslations()
  const fromConversation = props.fromConversation ? t('habits.form.fromConversation') : t('habits.flow.confirm.line')
  const detailsReady = !props.detailsLoading && !props.detailsError
  const waiting = props.detailsLoading ? <SummarySkeleton /> : props.detailsError ? <InlineLoadError message={props.detailsError.message} onRetry={props.detailsError.onRetry} /> : null
  return {
    question: t('habits.flow.confirm.question'),
    line: flow.offline ? t('habits.flow.orbit.offline') : fromConversation,
    free: <div role="group" aria-label={t('habits.flow.confirm.question')} className="flex flex-col gap-3">
      {waiting ?? <SummaryRows flow={flow} formHelpers={formHelpers} props={props} />}
      {props.notice}
      {props.saveError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{props.saveError}</p> : null}
      {detailsReady ? <QuestionRow question={t('habits.flow.more')} onPress={() => flow.open('more')} /> : null}
    </div>,
    primary: { label: props.createLabel, onPress: () => props.onSubmit({ stepCount: flow.steps.length, usedAiRead: flow.usedAiRead }), loading: props.pending || Boolean(props.detailsLoading), disabled: !props.detailsLoading && Boolean(props.detailsError) },
  }
}
