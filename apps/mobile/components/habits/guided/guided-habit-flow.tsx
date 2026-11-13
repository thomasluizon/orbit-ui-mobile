import { useState, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { formatLocaleDate, parseDatePhrase, toTime24, HABIT_TIME_OPTIONS } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { QuestionRow } from '@/components/ui/question-row'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionFlow } from '@/components/ui/question-flow'
import { TimeField } from '@/components/ui/time-field'
import { HabitTypeField } from '../habit-form-fields/habit-type-field'
import { useGuidedHabitFlow } from './use-guided-habit-flow'

export interface GuidedHabitFlowProps {
  formHelpers: HabitFormHelpers
  lockedGeneral: boolean | null
  fromConversation: boolean
  pending: boolean
  /** The server message of a failed save. The flow stays on the summary. */
  saveError: string | null
  /** The capacity or Pro notice of a refused create. It shows on the summary. */
  notice?: ReactNode
  /** The current form fields: the interim host of every question the summary row "Quer ajustar mais alguma coisa?" opens. */
  moreFields: ReactNode
  createLabel: string
  onSubmit: () => void
  onClose: () => void
}

type Flow = ReturnType<typeof useGuidedHabitFlow>

/** What one step shows. Every step supplies the question and the Orbit line, then its quick options, its free path and its primary action. */
interface StepView {
  question: string
  line: string | null
  options?: ReactNode
  free?: ReactNode
  primary?: { label: string; onPress: () => void; loading?: boolean; hint?: string }
}

function usePhraseView({ flow, formHelpers }: Readonly<{ flow: Flow; formHelpers: HabitFormHelpers }>): StepView {
  const { t } = useTranslation()
  const { form } = formHelpers
  const title = form.watch('title')
  const [hint, setHint] = useState<string | undefined>()
  const submit = () => {
    if (title.trim().length === 0) { setHint(t('habits.flow.what.hint')); return }
    void flow.leavePhrase()
  }
  return {
    question: t('habits.flow.what.question'),
    line: title.trim().length === 0 ? t('habits.flow.what.lineEmpty') : t('habits.flow.what.lineTyped'),
    free: <Input autoFocus label={t('habits.flow.what.label')} hideLabel value={title} placeholder={t('habits.flow.what.placeholder')} error={hint}
      onChange={(value) => { setHint(undefined); flow.changeTitle(value) }} onSubmit={submit} />,
    primary: { label: t('habits.flow.continue'), onPress: submit },
  }
}

function useWhenView({ flow, formHelpers }: Readonly<{ flow: Flow; formHelpers: HabitFormHelpers }>): StepView {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { profile } = useProfile()
  const [text, setText] = useState('')
  const [issue, setIssue] = useState<string | undefined>()
  const dueDate = formHelpers.form.watch('dueDate') ?? ''
  const submitText = () => {
    if (flow.readWhenPhrase(text)) return
    const result = parseDatePhrase(text, { referenceDate: flow.today, locale, timeZone: profile?.timeZone })
    if (result.status !== 'resolved') { setIssue(t('habits.flow.when.unresolved')); return }
    setIssue(undefined)
    flow.chooseDate(result.date)
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
      <Input label={t('habits.flow.when.freeLabel')} value={text} placeholder={t('habits.flow.when.freePlaceholder')} error={issue} onChange={setText} onSubmit={submitText} />
      <DateField label={t('habits.flow.when.calendar')} value={dueDate} minDate={flow.today} onChange={(date) => { if (date) flow.chooseDate(date) }} />
      <PillButton variant="ghost" onClick={submitText}>{t('habits.flow.continue')}</PillButton>
    </>,
  }
}

function useTimeView({ flow, formHelpers }: Readonly<{ flow: Flow; formHelpers: HabitFormHelpers }>): StepView {
  const { t } = useTranslation()
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

function useSummaryView({ flow, formHelpers, props }: Readonly<{ flow: Flow; formHelpers: HabitFormHelpers; props: GuidedHabitFlowProps }>): StepView {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { displayTime } = useTimeFormat()
  const { form } = formHelpers
  const dueDate = form.watch('dueDate') ?? ''
  const dueTime = form.watch('dueTime') ?? ''
  const task = form.watch('itemType') === 'task'
  const dated = !formHelpers.isGeneral && dueDate !== ''
  const row = (key: string, label: string, value: string, step: Parameters<Flow['open']>[0]) =>
    <ListRow key={key} placement="field" title={label} value={value} accessibilityLabel={`${label}, ${value}`} onClick={() => flow.open(step)} />
  return {
    question: t('habits.flow.confirm.question'),
    line: props.fromConversation ? t('habits.flow.orbit.fromConversation') : t('habits.flow.confirm.line'),
    free: <View style={styles.group}>
      {row('type', t('habits.flow.summary.type'), task ? t('habits.form.typeTask') : t('habits.form.typeHabit'), 'type')}
      {row('when', t('habits.flow.summary.when'), dated ? formatLocaleDate(dueDate, locale) : t('habits.flow.summary.noDate'), 'when')}
      {row('time', t('habits.flow.summary.time'), dueTime ? displayTime(dueTime) : t('habits.flow.summary.noTime'), 'time')}
      {row('reminder', t('habits.flow.summary.reminder'), form.watch('reminderEnabled') ? t('habits.flow.summary.withReminder') : t('habits.flow.summary.noReminder'), 'reminder')}
      {props.notice}
      {props.saveError ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>{props.saveError}</Text> : null}
      <QuestionRow question={t('habits.flow.more')} onPress={() => flow.open('more')} />
    </View>,
    primary: { label: props.createLabel, onPress: props.onSubmit, loading: props.pending },
  }
}


function useDetailViews(flow: Flow, formHelpers: HabitFormHelpers, props: GuidedHabitFlowProps): Record<'reminder' | 'type' | 'more', StepView> {
  const { t } = useTranslation()
  const { displayTime } = useTimeFormat()
  return {
    reminder: {
      question: t('habits.flow.reminder.question', { time: displayTime(formHelpers.form.watch('dueTime') ?? '') }),
      line: t('habits.flow.reminder.line'),
      options: <>
        <OptionCard label={t('habits.flow.reminder.yes')} onSelect={() => flow.answerReminder(true)} />
        <OptionCard label={t('habits.flow.reminder.no')} onSelect={() => flow.answerReminder(false)} />
      </>,
    },
    type: {
      question: t('habits.flow.type.question'),
      line: t('habits.flow.type.line'),
      free: <HabitTypeField formHelpers={formHelpers} lockedGeneral={props.lockedGeneral} onChange={() => { flow.markTypeDeliberate(); flow.advance() }} />,
    },
    more: { question: t('habits.flow.more'), line: null, free: props.moreFields, primary: { label: t('habits.flow.continue'), onPress: flow.advance } },
  }
}

/** The guided create flow. It renders one question at a time over the form state the modal owns. */
export function GuidedHabitFlow(props: Readonly<GuidedHabitFlowProps>) {
  const { formHelpers } = props
  const { t } = useTranslation()
  const flow = useGuidedHabitFlow({ formHelpers, lockedGeneral: props.lockedGeneral })
  const views = {
    what: usePhraseView({ flow, formHelpers }),
    when: useWhenView({ flow, formHelpers }),
    time: useTimeView({ flow, formHelpers }),
    summary: useSummaryView({ flow, formHelpers, props }),
    ...useDetailViews(flow, formHelpers, props),
  }
  const step = flow.current.step
  const view: StepView = (step === 'what' || step === 'when' || step === 'time' || step === 'reminder' || step === 'type' || step === 'more') ? views[step] : views.summary
  return (
    <QuestionFlow
      flow="habit_create"
      stepKey={step}
      direction={flow.current.direction}
      question={view.question}
      line={view.line}
      position={flow.position.position}
      total={flow.position.total}
      progressLabel={t('habits.flow.progress', { position: flow.position.position, total: flow.position.total })}
      backLabel={t('habits.flow.back')}
      closeLabel={t('habits.flow.close')}
      onBack={step === 'what' ? undefined : () => { flow.back() }}
      onClose={props.onClose}
      orbitState={flow.reading ? 'pensando' : 'parado'}
      statusText={flow.reading ? t('habits.flow.what.reading') : undefined}
      options={view.options}
      primary={view.primary}
    >
      {view.free}
    </QuestionFlow>
  )
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  error: { fontFamily: 'Geist_400Regular', fontSize: 14 },
})
