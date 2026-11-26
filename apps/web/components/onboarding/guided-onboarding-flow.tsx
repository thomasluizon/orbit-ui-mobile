'use client'

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import type { FlowStepView, QuestionFlowProps } from '@orbit/shared/contracts/flow'
import {
  buildOnboardingScheduleFromPhrase,
  canRepeatOnboardingScheduleWeeks,
  createOrbitAllowanceTranslator,
  getOnboardingRemindCopy,
  getOnboardingReminderPreviewTime,
  getOnboardingScheduleMode,
  HABIT_TIME_OPTIONS,
  isOnboardingIntroScreen,
  ONBOARDING_INTRO_SCREENS,
  onboardingBackTarget,
  onboardingRunningStatusKey,
  ONBOARDING_MODE_OPTIONS,
  ONBOARDING_STARTERS,
  getHabitPhraseTitle,
  onboardingGuidedPosition,
  onboardingModeDetailSteps,
  onboardingNeedsCadence,
  onboardingStepAfterAnswer,
  onboardingSummaryValue,
  ONBOARDING_UNIT_OPTIONS,
  formatOnboardingCadence,
  phraseLineKey,
  toTime24,
  type FlowValueFormat,
  type OnboardingIntroScreen,
  type OnboardingQuestionStep,
  type OnboardingSchedule,
  type OnboardingScheduleMode,
} from '@orbit/shared/utils'
import { createUseGuidedOnboardingNavigation } from '@orbit/shared/hooks'
import { PhraseField } from '@/components/habits/guided/phrase-field'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { FlowScreen } from '@/components/ui/flow-screen'
import { ListRow } from '@/components/ui/list-row'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { QuestionFlow } from '@/components/ui/question-flow'
import { TimeField } from '@/components/ui/time-field'
import { WeekdayPicker } from '@/components/ui/weekday-picker'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { Stepper } from './onboarding-stepper'
import type { OnboardingDecisionProps } from './onboarding-flow'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const WEEKDAYS: readonly string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const useGuidedNavigation = createUseGuidedOnboardingNavigation({ useState })

export interface GuidedOnboardingProps extends OnboardingDecisionProps {
  /** The emoji of the habit: the one the model proposed or the one the person chose, or empty. */
  habitEmoji: string
  /** True while the emoji is the proposal of the model. A choice of the person clears it. */
  emojiProposed: boolean
  onEmoji: (emoji: string) => void
  completionPending: boolean
  offline: boolean
  /** The current shell notices: the update banner, the completion error and the read verification. */
  notices: ReactNode
  /** Absent while a deferred push registration is recovered. */
  onBack?: () => void
  /** Leaves onboarding. Absent once the habit exists. */
  onSkip?: () => void
  /** The close after Create did not save the habit. The remind step states it with its own failure. */
  leaveFailed: boolean
}

type Translate = ReturnType<typeof useTranslations>

type StepView = FlowStepView & Pick<QuestionFlowProps, 'footer'>

function useValueFormat(): FlowValueFormat {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  return { translate: (key, values) => t(key, values), locale, displayTime }
}

function useCadenceText(schedule: OnboardingSchedule) {
  const format = useValueFormat()
  return (timed: boolean) => formatOnboardingCadence(schedule, timed, format)
}

function IntroSentence({ children }: Readonly<{ children: string }>) {
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  return (
    <motion.p key={children} data-intro-sentence="" initial={reducedMotion ? false : { opacity: 0, y: motionLayerTiming.routeShift }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: motionLayerTiming.contentStagger / 1000, duration: motionDurations.slow / 1000, ease: [...motionEasings.enter] as [number, number, number, number] }}
      className="text-center text-[17px] leading-[26px] text-[var(--fg-2)]">{children}</motion.p>
  )
}

function introView(screen: OnboardingIntroScreen, t: Translate, onNext: () => void, onSkipIntro: () => void): StepView {
  return {
    question: t(`onboarding.flow.guided.intro.${screen}.title`),
    line: null,
    free: <IntroSentence>{t(`onboarding.flow.guided.intro.${screen}.body`)}</IntroSentence>,
    primary: { label: t('onboarding.flow.continue'), onPress: onNext },
    footer: <PillButton variant="ghost" size="sm" minimumHeight={48} onClick={onSkipIntro}>{t('onboarding.flow.guided.intro.skip')}</PillButton>,
  }
}

function usePhraseView(props: GuidedOnboardingProps, cadenceOfPhrase: string | null): StepView {
  const t = useTranslations()
  const [hint, setHint] = useState<string | undefined>()
  const [focusRequest, setFocusRequest] = useState(0)
  const submit = () => {
    if (!props.sentence.trim()) { setHint(t('onboarding.flow.what.continueReason')); setFocusRequest((request) => request + 1); return }
    props.onContinueWhat()
  }
  const line = props.offline ? t('habits.flow.orbit.offline') : t(phraseLineKey(props.sentence, cadenceOfPhrase !== null), { parts: cadenceOfPhrase ?? '' })
  return {
    question: t('onboarding.flow.guided.what.question'),
    line,
    options: ONBOARDING_STARTERS.map((key) => (
      <OptionCard key={key} label={t(`onboarding.flow.what.starterLabels.${key}`)} selected={props.sentence === t(`onboarding.flow.what.starters.${key}`)}
        onSelect={() => props.onStarter(t(`onboarding.flow.what.starters.${key}`))} />
    )),
    free: <PhraseField label={t('onboarding.flow.guided.what.question')} value={props.sentence} placeholder={t('onboarding.flow.what.placeholder')} maxLength={100} hint={hint}
      marks={props.marks} marksLabel={t('onboarding.flow.what.marksLabel')} focusRequest={focusRequest}
      onChange={(value) => { setHint(undefined); props.onSentence(value) }} onSubmit={() => { if (!props.suggestionPending) submit() }} />,
    primary: { label: t('onboarding.flow.continue'), onPress: submit, loading: props.suggestionPending },
    footer: props.isLive ? null : <>
      {/* eslint-disable-next-line local/max-button-words -- The granted onboarding drawing uses this account action label. */}
      <PillButton variant="ghost" size="sm" minimumHeight={48} onClick={props.onAccount}>{t('onboarding.flow.what.haveAccount')}</PillButton>
    </>,
  }
}

function modeView(props: GuidedOnboardingProps, t: Translate, onMode: (mode: OnboardingScheduleMode) => void): StepView {
  const current = getOnboardingScheduleMode(props.schedule)
  return {
    question: t('onboarding.flow.when.scheduleMode'),
    line: null,
    options: ONBOARDING_MODE_OPTIONS.map((mode) => (
      <OptionCard key={mode} label={t(`onboarding.flow.guided.mode.${mode}`)} selected={!props.schedule.isGeneral && current === mode} onSelect={() => onMode(mode)} />
    )),
  }
}

function daysView(props: GuidedOnboardingProps, t: Translate, onDone: () => void): StepView {
  const setDays = (target: readonly string[]) => {
    for (const day of DAYS) if (props.schedule.days.includes(day) !== target.includes(day)) props.onToggleDay(day)
    onDone()
  }
  return {
    question: t('onboarding.flow.when.daysLabel'),
    line: null,
    options: <>
      <OptionCard label={t('onboarding.flow.guided.days.everyDay')} selected={props.schedule.days.length === DAYS.length} onSelect={() => setDays(DAYS)} />
      <OptionCard label={t('onboarding.flow.guided.days.weekdays')} onSelect={() => setDays(WEEKDAYS)} />
    </>,
    free: <>
      <WeekdayPicker label={t('onboarding.flow.when.daysLabel')} days={props.schedule.days} onToggleDay={props.onToggleDay}
        dayOptions={DAYS.map((day) => ({ value: day, label: t(`onboarding.flow.when.days.${day.toLowerCase()}`), accessibleLabel: t(`onboarding.flow.when.daysLong.${day.toLowerCase()}`) }))} />
      {canRepeatOnboardingScheduleWeeks(props.schedule, props.isLive) ? <Stepper value={props.schedule.intervalWeeks} minimum={1} maximum={MAX_HABIT_INTERVAL_WEEKS} lessLabel={t('onboarding.flow.when.intervalLess')}
        moreLabel={t('onboarding.flow.when.intervalMore')} description={t('onboarding.flow.when.interval', { count: props.schedule.intervalWeeks })} onChange={props.onIntervalWeeks} /> : null}
    </>,
    primary: { label: t('onboarding.flow.continue'), onPress: onDone },
  }
}

function unitView(props: GuidedOnboardingProps, t: Translate, onDone: () => void): StepView {
  const current = props.schedule.frequencyUnit ?? 'Week'
  return {
    question: t('onboarding.flow.when.frequencyUnitLabel'),
    line: null,
    options: ONBOARDING_UNIT_OPTIONS.map((unit) => (
      <OptionCard key={unit} label={t(`onboarding.flow.when.units.${unit.toLowerCase()}`)} selected={current === unit} onSelect={() => { props.onFrequencyUnit(unit); onDone() }} />
    )),
  }
}

function countView(props: GuidedOnboardingProps, t: Translate, kind: 'quantity' | 'interval', onDone: () => void): StepView {
  const count = props.schedule.frequencyQuantity ?? 1
  const unit = (props.schedule.frequencyUnit ?? (kind === 'quantity' ? 'Week' : 'Day')).toLowerCase()
  const description = kind === 'quantity' ? t(`onboarding.flow.when.quantityUnit.${unit}`, { count }) : t(`onboarding.flow.when.cadence.intervalUnit.${unit}`, { count })
  return {
    question: t(`onboarding.flow.guided.${kind}.question`),
    line: null,
    free: <Stepper value={count} minimum={1} lessLabel={t(kind === 'quantity' ? 'onboarding.flow.when.quantityLess' : 'onboarding.flow.when.frequencyLess')}
      moreLabel={t(kind === 'quantity' ? 'onboarding.flow.when.quantityMore' : 'onboarding.flow.when.frequencyMore')} description={description} onChange={props.onQuantity} />,
    primary: { label: t('onboarding.flow.continue'), onPress: onDone },
  }
}

function useTimeView(props: GuidedOnboardingProps, onDone: () => void): StepView {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const answer = (time: string) => { props.onTime(time); onDone() }
  return {
    question: t('onboarding.flow.guided.time.question'),
    line: t('onboarding.flow.guided.time.line'),
    options: <>
      {HABIT_TIME_OPTIONS.map((time) => <OptionCard key={time} label={displayTime(time)} selected={props.schedule.dueTime === time} onSelect={() => answer(time)} />)}
      <OptionCard label={t('onboarding.flow.guided.time.none')} selected={props.schedule.dueTime === ''} onSelect={() => answer('')} />
    </>,
    free: <TimeField label={t('onboarding.flow.guided.time.freeLabel')} value={toTime24(props.schedule.dueTime)} onChange={props.onTime} onClear={() => props.onTime('')} />,
    primary: { label: t('onboarding.flow.continue'), onPress: onDone },
  }
}

function useSummaryValue(props: GuidedOnboardingProps, habitTitle: string) {
  const format = useValueFormat()
  return (step: OnboardingQuestionStep): string => onboardingSummaryValue(step, props.schedule, habitTitle, format)
}

function useSummaryView(props: GuidedOnboardingProps, habitTitle: string, cadenceText: (timed: boolean) => string, open: (step: OnboardingQuestionStep) => void): StepView {
  const t = useTranslations()
  const locale = useLocale()
  const translate = createOrbitAllowanceTranslator(t, { aiMessagesPeriod: props.allowancePeriod }, locale)
  const value = useSummaryValue(props, habitTitle)
  const row = (step: OnboardingQuestionStep) => (
    <Proposed key={step} proposed={props.proposed && step !== 'what'} scope="row" label={t('onboarding.flow.when.proposedBy')} keepMounted>
      <ListRow placement="field" title={t(`onboarding.flow.guided.summary.${step}`)} value={value(step)} onClick={() => open(step)} />
    </Proposed>
  )
  return {
    question: t('onboarding.flow.guided.summary.question'),
    line: t('habits.flow.what.lineUnderstood', { parts: cadenceText(true) }),
    free: <div role="group" aria-label={t('onboarding.flow.guided.summary.question')} className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <HabitEmojiSelector selectedEmoji={props.habitEmoji} proposed={props.emojiProposed} onSelect={props.onEmoji} />
        <div className="min-w-0 flex-1">{row('what')}</div>
      </div>
      {row('mode')}
      {onboardingModeDetailSteps(getOnboardingScheduleMode(props.schedule)).map(row)}
      {row('time')}
      {props.atLimit ? <CapacityNotice message={translate('onboarding.flow.when.limit', { allowance: props.allowance })} /> : null}
      {props.createFailed ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{t('onboarding.flow.createFailed')}</p> : null}
    </div>,
    primary: { label: t(props.createFailed ? 'onboarding.flow.retry' : 'onboarding.flow.create'), onPress: props.onSave, loading: props.creating },
  }
}

function ReminderPreview({ title, time }: Readonly<{ title: string; time: string }>) {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-[var(--bg-well)] p-4 text-start">
      <div className="flex items-center gap-2"><OrbitMascot size={16} /><span translate="no" className="font-mono text-xs text-[var(--fg-3)]">Orbit</span><span className="flex-1" /><time className="font-mono text-xs tabular-nums text-[var(--fg-3)]">{time}</time></div>
      <strong className="block text-base font-medium leading-[1.4] text-[var(--fg-1)]">{title}</strong>
      <span className="text-sm leading-[1.4] text-[var(--fg-2)]">{t('onboarding.flow.remind.notificationBody')}</span>
    </div>
  )
}

function useRemindView(props: GuidedOnboardingProps, onEdit: (step: OnboardingQuestionStep) => void): StepView {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const previewTime = displayTime(getOnboardingReminderPreviewTime(props.schedule.dueTime))
  const { titleKey, bodyKey } = getOnboardingRemindCopy(props.reminderState, props.isLive)
  const continueOption = <OptionCard label={t('onboarding.flow.remind.continue')} onSelect={props.onContinueWithout} />
  if (props.reminderState === 'ask') {
    return {
      question: t('onboarding.flow.guided.remind.question', { time: previewTime }),
      line: t('onboarding.flow.guided.remind.line'),
      options: <>
        <OptionCard label={t('onboarding.flow.guided.remind.allow')} onSelect={props.onAllow} />
        <OptionCard label={t('onboarding.flow.remind.deny')} onSelect={props.onContinueWithout} />
      </>,
      free: <ReminderPreview title={props.createdTitle} time={previewTime} />,
    }
  }
  const body = <IntroSentence>{t(`onboarding.flow.remind.${bodyKey}`)}</IntroSentence>
  const base = { question: t(`onboarding.flow.remind.${titleKey}`), line: null, free: body }
  if (props.reminderState === 'failed') return { ...base, options: <><OptionCard label={t('onboarding.flow.retry')} onSelect={props.onAllow} />{continueOption}</> }
  if (props.reminderState === 'no-time') return { ...base, options: <><OptionCard label={t('onboarding.flow.remind.setTime')} onSelect={() => onEdit('time')} />{continueOption}</> }
  if (props.reminderState === 'no-day') return { ...base, options: <><OptionCard label={t('onboarding.flow.remind.setDays')} onSelect={() => onEdit('days')} />{continueOption}</> }
  return { ...base, primary: { label: t('onboarding.flow.remind.continue'), onPress: props.onContinueWithout, loading: props.reminderDecision === 'declining' } }
}

/** The guided onboarding: the intro, then one question at a time on the shared flow shell. The state, the requests and the reminder logic stay in `OnboardingFlow`. */
export function GuidedOnboardingFlow(props: Readonly<GuidedOnboardingProps>) {
  const t = useTranslations()
  const locale = useLocale() === 'pt-BR' ? 'pt-BR' : 'en'
  const { navigation, introRun, go, backAction } = useGuidedNavigation({ step: props.step, phraseReads: props.phraseReads, readIntroSeen: () => useOnboardingDraftStore.getState().introSeen, readNeedsCadence: () => onboardingNeedsCadence(props.schedule, props.proposed) })
  const { view, direction, cadencePath, editing } = navigation
  const toSummary = () => go('summary', 1, { editing: false, walking: false })
  const answered = (step: OnboardingQuestionStep) => {
    const next = onboardingStepAfterAnswer(getOnboardingScheduleMode(props.schedule), step, navigation.walking)
    if (next === 'summary') toSummary()
    else go(next, 1)
  }
  const phraseSchedule = buildOnboardingScheduleFromPhrase(props.sentence, locale)
  const phraseRead = phraseSchedule.isGeneral && !phraseSchedule.dueTime ? null : phraseSchedule
  const cadenceOfPhrase = useCadenceText(phraseSchedule)
  const cadenceText = useCadenceText(props.schedule)
  const answerMode = (mode: OnboardingScheduleMode) => {
    props.onMode(mode)
    const steps = onboardingModeDetailSteps(mode)
    const first = steps[0]
    if (!first) { toSummary(); return }
    go(first, 1, editing ? { walking: true } : { walking: true, cadencePath: ['mode', ...steps] })
  }
  const views: Record<OnboardingQuestionStep, StepView> = {
    what: usePhraseView(props, phraseRead ? cadenceOfPhrase(true) : null),
    mode: modeView(props, t, answerMode),
    unit: unitView(props, t, () => answered('unit')),
    days: daysView(props, t, toSummary),
    quantity: countView(props, t, 'quantity', toSummary),
    interval: countView(props, t, 'interval', toSummary),
    time: useTimeView(props, toSummary),
    summary: useSummaryView(props, getHabitPhraseTitle(props.sentence, locale), cadenceText, (step) => go(step, 1, { editing: true, walking: false })),
    remind: useRemindView(props, (step) => { go(view, 1, { pendingEdit: step }); props.onEditSchedule() }),
  }
  const leaveIntro = () => {
    useOnboardingDraftStore.getState().markIntroSeen()
    go('what', 1)
  }
  const nextIntro = (screen: OnboardingIntroScreen) => {
    const next = ONBOARDING_INTRO_SCREENS[ONBOARDING_INTRO_SCREENS.indexOf(screen) + 1]
    if (next) go(next, 1)
    else leaveIntro()
  }
  const stepView = isOnboardingIntroScreen(view) ? introView(view, t, () => nextIntro(view), leaveIntro) : views[view]
  const back = backAction(onboardingBackTarget(navigation, introRun), props.onBack)
  const close = props.onSkip ?? props.onContinueWithout
  const progress = isOnboardingIntroScreen(view) ? { position: ONBOARDING_INTRO_SCREENS.indexOf(view) + 1, total: ONBOARDING_INTRO_SCREENS.length } : onboardingGuidedPosition(view, cadencePath)
  const statusKey = onboardingRunningStatusKey(props)

  return (
    <FlowScreen label={t('onboarding.flow.guided.screenLabel')} onDismiss={back ?? close}>
      <QuestionFlow
        flow="onboarding"
        stepKey={view}
        direction={direction}
        question={stepView.question}
        line={stepView.line}
        position={progress.position}
        total={progress.total}
        progressLabel={t('habits.flow.progress', progress)}
        backLabel={t('onboarding.flow.back')}
        closeLabel={t('onboarding.flow.skip')}
        onBack={back}
        onClose={isOnboardingIntroScreen(view) ? undefined : close}
        orbitState={statusKey ? 'pensando' : 'parado'}
        statusText={statusKey ? t(statusKey) : undefined}
        options={stepView.options}
        primary={stepView.primary}
        footer={<>
          {props.leaveFailed && view !== 'remind' ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{t('onboarding.flow.completionFailed')}</p> : null}
          {stepView.footer}{props.notices}
        </>}
      >
        {stepView.free}
      </QuestionFlow>
    </FlowScreen>
  )
}

