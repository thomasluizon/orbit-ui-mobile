'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_TITLE_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import {
  formatLocaleDate,
  getAccountDay,
  isGoalDeadlinePast,
  parseDatePhrase,
  resolveGoalDeadlineChoice,
  type GoalDeadlineChoice,
  type GoalFlowStep,
  type GoalFlowStepError,
} from '@orbit/shared/utils'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'

/** The draft a goal flow answers. Create and edit each hold their own owner and pass this view of it. */
export interface GoalDraftPort {
  goalType: GoalType
  description: string
  targetValue: string
  unit: string
  deadline: string
  setDescription: (value: string) => void
  setTargetValue: (value: string) => void
  setUnit: (value: string) => void
  setDeadline: (value: string) => void
  /** Absent on edit: the type of a stored goal is shown, not changed. */
  chooseType?: (type: GoalType) => void
}

/** The hint of an empty or invalid continue. `request` moves focus to the field each time it changes. */
export interface GoalStepHint {
  field: GoalFlowStepError['field']
  message: string
  request: number
}

export interface GoalStepContext {
  draft: GoalDraftPort
  hint: GoalStepHint | null
  /** Validates the step, then shows its hint or moves on. */
  submit: (step: GoalFlowStep) => void
  advance: () => void
}

function hintFor(hint: GoalStepHint | null, field: GoalStepHint['field']) {
  return hint?.field === field ? { error: hint.message, focusRequest: hint.request } : {}
}

export function useWhatView({ draft, hint, submit }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const question = t('goals.form.title')
  return {
    question,
    line: t('goals.flow.what.line'),
    free: <Input autoFocus label={question} hideLabel name="goal-title" value={draft.description} maxLength={MAX_GOAL_TITLE_LENGTH}
      placeholder={draft.goalType === 'Streak' ? t('goals.form.streakDescriptionPlaceholder') : t('goals.form.descriptionPlaceholder')}
      {...hintFor(hint, 'description')} onChange={draft.setDescription} onSubmit={() => submit('what')} />,
    primary: { label: t('habits.flow.continue'), onPress: () => submit('what') },
  }
}

export function useTrackView({ draft, advance }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const answer = (type: GoalType) => { draft.chooseType?.(type); advance() }
  return {
    question: t('goals.form.typeQuestion'),
    line: t('goals.flow.track.line'),
    options: <>
      <OptionCard label={t('goals.form.typeStandard')} selected={draft.goalType === 'Standard'} onSelect={() => answer('Standard')} />
      <OptionCard label={t('goals.form.typeStreak')} selected={draft.goalType === 'Streak'} onSelect={() => answer('Streak')} />
    </>,
  }
}

export function useAmountView({ draft, hint, submit }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const streak = draft.goalType === 'Streak'
  const question = t(streak ? 'goals.form.streakTarget' : 'goals.form.targetValueQuestion')
  return {
    question,
    line: t(streak ? 'goals.flow.amount.streakLine' : 'goals.flow.amount.line'),
    free: <>
      <Input autoFocus label={question} hideLabel name="goal-target" kind="number" inputMode="decimal" value={draft.targetValue}
        placeholder={streak ? t('goals.form.streakTargetPlaceholder') : undefined} {...hintFor(hint, 'targetValue')}
        onChange={draft.setTargetValue} onSubmit={() => submit('amount')} />
      {streak ? null : <Input label={t('goals.form.unitQuestion')} name="goal-unit" value={draft.unit} maxLength={MAX_GOAL_UNIT_LENGTH}
        placeholder={t('goals.form.unitPlaceholder')} {...hintFor(hint, 'unit')} onChange={draft.setUnit} onSubmit={() => submit('amount')} />}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: () => submit('amount') },
  }
}

const DEADLINE_CHOICES: readonly { choice: GoalDeadlineChoice; label: string }[] = [
  { choice: 'none', label: 'goals.flow.deadline.none' },
  { choice: 'monthEnd', label: 'goals.flow.deadline.monthEnd' },
  { choice: 'yearEnd', label: 'goals.flow.deadline.yearEnd' },
]

export function useDeadlineView({ draft, advance }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const [words, setWords] = useState('')
  const [issue, setIssue] = useState<string | undefined>()
  const now = new Date()
  const today = getAccountDay(now, profile?.timeZone)
  const choose = (deadline: string) => { setIssue(undefined); draft.setDeadline(deadline); advance() }
  const submitWords = () => {
    if (words.trim().length === 0) { advance(); return }
    const read = parseDatePhrase(words, { referenceDate: today, locale, timeZone: profile?.timeZone })
    if (read.status !== 'resolved') { setIssue(t('habits.flow.when.unresolved')); return }
    if (isGoalDeadlinePast(read.date, today)) { setIssue(t('goals.form.deadlineInPast')); return }
    choose(read.date)
  }
  return {
    question: t('goals.form.deadlineQuestion'),
    line: t('goals.flow.deadline.line'),
    options: <>
      {DEADLINE_CHOICES.map(({ choice, label }) => {
        const value = resolveGoalDeadlineChoice(choice, now, profile?.timeZone)
        return <OptionCard key={choice} label={t(label)} selected={draft.deadline === value} onSelect={() => choose(value)} />
      })}
    </>,
    free: <>
      <Input label={t('habits.flow.when.freeLabel')} name="goal-deadline-words" value={words} error={issue}
        onChange={(value) => { setIssue(undefined); setWords(value) }} onSubmit={submitWords} />
      <DateField label={t('habits.flow.when.calendar')} value={draft.deadline} minDate={today} onChange={(date) => { if (date) choose(date) }} />
      <PillButton variant="ghost" onClick={submitWords}>{t('habits.flow.continue')}</PillButton>
    </>,
  }
}

/** Joins up to three names through `Intl.ListFormat`, and counts the rest in one phrase at the end. */
export function joinNames(names: readonly string[], locale: string, more: (count: number) => string): string {
  const shown = names.slice(0, 3)
  const parts = names.length > shown.length ? [...shown, more(names.length - shown.length)] : shown
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts)
}

interface GoalSummaryProps {
  draft: GoalDraftPort
  /** Edit shows the type of the stored goal and no habits row. */
  mode: 'create' | 'edit'
  /** The linked habits as the row shows them. Absent on edit. */
  habitsValue?: string
  /** False when the goal starts from a habit: the row shows that habit and opens nothing. */
  habitsEditable?: boolean
  error?: string
  onOpen: (step: GoalFlowStep) => void
}

/** The summary: every value is a control that opens its step, and the answer returns here. */
export function GoalSummary({ draft, mode, habitsValue, habitsEditable = true, error, onOpen }: Readonly<GoalSummaryProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const type = t(draft.goalType === 'Streak' ? 'goals.form.typeStreak' : 'goals.form.typeStandard')
  const amount = `${draft.targetValue} ${draft.unit}`.trim()
  const deadline = draft.deadline ? formatLocaleDate(draft.deadline, locale) : t('goals.flow.deadline.none')
  const row = (step: GoalFlowStep, label: string, value: string) =>
    <ListRow key={step} placement="field" title={label} value={value} onClick={() => onOpen(step)} />
  return (
    <div role="group" aria-label={t('habits.flow.confirm.question')} className="flex flex-col gap-3">
      {row('what', t('goals.flow.summary.what'), draft.description)}
      {mode === 'create' ? row('track', t('goals.flow.summary.track'), type) : <ListRow placement="field" readOnly title={t('goals.flow.summary.track')} value={type} />}
      {row('amount', t('goals.flow.summary.amount'), amount)}
      {row('deadline', t('goals.flow.summary.deadline'), deadline)}
      {habitsValue === undefined ? null : habitsEditable
        ? row('habits', t('goals.linkedHabits'), habitsValue)
        : <ListRow placement="field" readOnly title={t('goals.linkedHabits')} value={habitsValue} />}
      {error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p> : null}
    </div>
  )
}
