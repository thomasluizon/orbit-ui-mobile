'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalType } from '@orbit/shared/types/goal'
import { MAX_GOAL_TITLE_LENGTH, MAX_GOAL_UNIT_LENGTH } from '@orbit/shared/validation'
import {
  formatLocaleDate,
  GOAL_DEADLINE_CHOICES,
  getAccountDay,
  isGoalDeadlinePast,
  parseDatePhrase,
  resolveGoalDeadlineChoice,
  goalStepHintFor,
  type GoalDraftPort,
  type GoalFlowStep,
  type GoalStepHint,
} from '@orbit/shared/utils'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { PrimaryActionSlot } from '@/components/ui/primary-action-slot'
import { useProfile } from '@/hooks/use-profile'

export interface GoalStepContext {
  draft: GoalDraftPort
  hint: GoalStepHint | null
  /** Validates the step, then shows its hint or moves on. */
  submit: (step: GoalFlowStep) => void
  advance: () => void
  /** True when the deadline already holds an answer, as the stored goal of an edit does. A fresh draft has none, so no deadline option shows as chosen. */
  deadlineAnswered?: boolean
}

export function useWhatView({ draft, hint, submit }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const question = t('goals.form.title')
  return {
    question,
    line: t('goals.flow.what.line'),
    free: <Input autoFocus label={question} hideLabel name="goal-title" value={draft.description} maxLength={MAX_GOAL_TITLE_LENGTH}
      placeholder={draft.goalType === 'Streak' ? t('goals.form.streakDescriptionPlaceholder') : t('goals.form.descriptionPlaceholder')}
      {...goalStepHintFor(hint, 'description')} onChange={draft.setDescription} onSubmit={() => submit('what')} />,
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
        placeholder={streak ? t('goals.form.streakTargetPlaceholder') : undefined} {...goalStepHintFor(hint, 'targetValue')}
        onChange={draft.setTargetValue} onSubmit={() => submit('amount')} />
      {streak ? null : <Input label={t('goals.form.unitQuestion')} name="goal-unit" value={draft.unit} maxLength={MAX_GOAL_UNIT_LENGTH}
        placeholder={t('goals.form.unitPlaceholder')} {...goalStepHintFor(hint, 'unit')} onChange={draft.setUnit} onSubmit={() => submit('amount')} />}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: () => submit('amount') },
  }
}

export function useDeadlineView({ draft, advance, deadlineAnswered = false }: GoalStepContext): FlowStepView {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const [words, setWords] = useState('')
  const [issue, setIssue] = useState<string | undefined>()
  const [answered, setAnswered] = useState(deadlineAnswered)
  const now = new Date()
  const today = getAccountDay(now, profile?.timeZone)
  const choose = (deadline: string) => { setIssue(undefined); setAnswered(true); draft.setDeadline(deadline); advance() }
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
      {GOAL_DEADLINE_CHOICES.map(({ choice, label }) => {
        const value = resolveGoalDeadlineChoice(choice, now, profile?.timeZone)
        return <OptionCard key={choice} label={t(label)} selected={answered && draft.deadline === value} onSelect={() => choose(value)} />
      })}
    </>,
    free: <>
      <Input label={t('habits.flow.when.freeLabel')} name="goal-deadline-words" value={words} error={issue}
        onChange={(value) => { setIssue(undefined); setWords(value) }} onSubmit={submitWords} />
      <DateField label={t('habits.flow.when.calendar')} value={draft.deadline} minDate={today} onChange={(date) => { if (date) choose(date) }} />
      <PrimaryActionSlot><PillButton variant="ghost" onClick={submitWords}>{t('habits.flow.continue')}</PillButton></PrimaryActionSlot>
    </>,
  }
}

interface GoalSummaryProps {
  draft: GoalDraftPort
  mode: 'create' | 'edit'
  habitsValue?: string
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
    <fieldset aria-label={t('habits.flow.confirm.question')} className="flex flex-col gap-3 min-w-0">
      {row('what', t('goals.flow.summary.what'), draft.description)}
      {mode === 'create' ? row('track', t('goals.flow.summary.track'), type) : <ListRow placement="field" readOnly title={t('goals.flow.summary.track')} value={type} />}
      {row('amount', t('goals.flow.summary.amount'), amount)}
      {row('deadline', t('goals.flow.summary.deadline'), deadline)}
      {habitsValue === undefined ? null : habitsEditable
        ? row('habits', t('goals.linkedHabits'), habitsValue)
        : <ListRow placement="field" readOnly title={t('goals.linkedHabits')} value={habitsValue} />}
      {error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p> : null}
    </fieldset>
  )
}
