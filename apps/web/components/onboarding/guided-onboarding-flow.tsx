'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import type { FlowStepView, QuestionFlowProps } from '@orbit/shared/contracts/flow'
import {
  buildOnboardingScheduleFromPhrase,
  canRepeatOnboardingScheduleWeeks,
  createAstraAllowanceTranslator,
  describeOnboardingCadence,
  formatWeekdaySchedule,
  getOnboardingRemindCopy,
  getOnboardingReminderPreviewTime,
  getOnboardingScheduleMode,
  HABIT_TIME_OPTIONS,
  ONBOARDING_INTRO_SCREENS,
  ONBOARDING_MODE_OPTIONS,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_STARTERS,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  getHabitPhraseTitle,
  onboardingGuidedPosition,
  onboardingModeDetailSteps,
  onboardingModeKey,
  onboardingNeedsCadence,
  onboardingStepAfterAnswer,
  ONBOARDING_UNIT_OPTIONS,
  phraseLineKey,
  toTime24,
  type OnboardingIntroScreen,
  type OnboardingQuestionStep,
  type OnboardingSchedule,
  type OnboardingScheduleMode,
} from '@orbit/shared/utils'
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
import { Stepper } from './onboarding-create-habit'
import type { OnboardingDecisionProps } from './onboarding-flow'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const WEEKDAYS: readonly string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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
}

type FlowView = OnboardingIntroScreen | OnboardingQuestionStep
type Translate = ReturnType<typeof useTranslations>

/** An onboarding step adds one quiet control under the block, such as the skip of the intro. */
type StepView = FlowStepView & Pick<QuestionFlowProps, 'footer'>

interface Navigation {
  view: FlowView
  direction: 1 | -1
  /** The steps the read left open, asked after the phrase. Back walks them, and progress counts them. */
  cadencePath: OnboardingQuestionStep[]
  /** A step opened from the summary returns to it. */
  editing: boolean
  /** True while the flow walks the steps of a repeat mode, after the mode answer. Each answer then opens the next step of the mode. */
  walking: boolean
  /** The step a reminder state opens on the summary step, such as the time. */
  pendingEdit: OnboardingQuestionStep | null
}

function isIntro(view: FlowView): view is OnboardingIntroScreen {
  return (ONBOARDING_INTRO_SCREENS as readonly string[]).includes(view)
}

/** The view a step change of the onboarding state opens. */
function viewAfterStep(navigation: Navigation, previous: number, step: number, needsCadence: boolean): Navigation {
  const direction = step > previous ? 1 : -1
  if (step === ONBOARDING_WHAT_STEP) return { ...navigation, view: 'what', direction, editing: false, cadencePath: [] }
  if (step === ONBOARDING_REMIND_STEP) return { ...navigation, view: 'remind', direction, editing: false }
  if (previous === ONBOARDING_WHAT_STEP) return { ...navigation, view: needsCadence ? 'mode' : 'summary', direction, editing: false, cadencePath: needsCadence ? ['mode'] : [] }
  const target = navigation.pendingEdit ?? 'summary'
  return { ...navigation, view: target, direction, editing: target !== 'summary', pendingEdit: null }
}

function useCadenceText(schedule: OnboardingSchedule) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  return (timed: boolean) => {
    const cadence = describeOnboardingCadence(schedule, timed && Boolean(schedule.dueTime))
    const days = formatWeekdaySchedule(schedule.days, locale, t, schedule.days.length > 1 || schedule.intervalWeeks > 1)
    return t(cadence.key, { count: cadence.count, days, time: displayTime(schedule.dueTime) })
  }
}

/** The body sentence enters one shared stagger after the block. Reduced motion shows it at once. */
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
      onChange={(value) => { setHint(undefined); props.onSentence(value) }} />,
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

/** The period of a count or an interval: one quick option for each period. A press answers and the flow moves on. */
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

/** The value each summary row shows for its step. */
function useSummaryValue(props: GuidedOnboardingProps, habitTitle: string, cadenceText: (timed: boolean) => string) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  return (step: OnboardingQuestionStep): string => {
    if (step === 'what') return habitTitle
    if (step === 'mode') return t(onboardingModeKey(props.schedule))
    if (step === 'unit') return t(`onboarding.flow.when.units.${(props.schedule.frequencyUnit ?? 'Week').toLowerCase()}`)
    if (step === 'time') return props.schedule.dueTime ? displayTime(props.schedule.dueTime) : t('onboarding.flow.when.anyTime')
    return cadenceText(false)
  }
}

function useSummaryView(props: GuidedOnboardingProps, habitTitle: string, cadenceText: (timed: boolean) => string, open: (step: OnboardingQuestionStep) => void): StepView {
  const t = useTranslations()
  const locale = useLocale()
  const translate = createAstraAllowanceTranslator(t, { aiMessagesPeriod: props.allowancePeriod }, locale)
  const value = useSummaryValue(props, habitTitle, cadenceText)
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

function initialView(step: number, introRun: boolean): FlowView {
  if (introRun) return 'talk'
  if (step === ONBOARDING_REMIND_STEP) return 'remind'
  return step === ONBOARDING_WHEN_STEP ? 'summary' : 'what'
}

function useGuidedNavigation(props: GuidedOnboardingProps) {
  const [introRun] = useState(() => props.step === ONBOARDING_WHAT_STEP && !useOnboardingDraftStore.getState().introSeen)
  const [navigation, setNavigation] = useState<Navigation>(() => ({ view: initialView(props.step, introRun), direction: 1, cadencePath: [], editing: false, walking: false, pendingEdit: null }))
  const [trackedStep, setTrackedStep] = useState(props.step)
  if (trackedStep !== props.step) {
    setTrackedStep(props.step)
    setNavigation((current) => viewAfterStep(current, trackedStep, props.step, onboardingNeedsCadence(props.schedule, props.proposed)))
  }
  useEffect(() => { if (introRun) useOnboardingDraftStore.getState().markIntroSeen() }, [introRun])
  const go = (view: FlowView, direction: 1 | -1, patch: Partial<Navigation> = {}) => setNavigation((current) => ({ ...current, ...patch, view, direction }))
  return { navigation, introRun, go }
}

function backTarget(navigation: Navigation, introRun: boolean): FlowView | 'step' | null {
  const { view, editing, cadencePath } = navigation
  if (view === 'talk') return null
  if (isIntro(view)) return ONBOARDING_INTRO_SCREENS[ONBOARDING_INTRO_SCREENS.indexOf(view) - 1]!
  if (view === 'what') return introRun ? 'restart' : null
  if (editing) return 'summary'
  if (view === 'summary') return cadencePath.at(-1) ?? 'step'
  const index = cadencePath.indexOf(view)
  return index > 0 ? cadencePath[index - 1]! : 'step'
}

function backAction(target: FlowView | 'step' | null, onStepBack: (() => void) | undefined, go: (view: FlowView, direction: 1 | -1, patch?: Partial<Navigation>) => void): (() => void) | undefined {
  if (target === null) return undefined
  if (target !== 'step') return () => go(target, -1, { editing: false })
  return onStepBack
}

/** In a guided flow Orbit in Pensando is the running feedback: the read, the create, the reminder decision and the completion. */
function runningStatusKey(props: GuidedOnboardingProps): string | null {
  if (props.suggestionPending) return 'habits.flow.what.reading'
  if (props.creating) return 'onboarding.flow.guided.creating'
  return props.reminderDecision !== 'idle' || props.completionPending ? 'onboarding.flow.guided.remind.pending' : null
}

/** The guided onboarding: the intro, then one question at a time on the shared flow shell. The state, the requests and the reminder logic stay in `OnboardingFlow`. */
export function GuidedOnboardingFlow(props: Readonly<GuidedOnboardingProps>) {
  const t = useTranslations()
  const locale = useLocale() === 'pt-BR' ? 'pt-BR' : 'en'
  const { navigation, introRun, go } = useGuidedNavigation(props)
  const { view, direction, cadencePath, editing } = navigation
  const toSummary = () => go('summary', 1, { editing: false, walking: false })
  /** An answer inside the repeat steps opens the next step of the mode, or the summary. */
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
  const nextIntro = (screen: OnboardingIntroScreen) => {
    const index = ONBOARDING_INTRO_SCREENS.indexOf(screen)
    go(ONBOARDING_INTRO_SCREENS[index + 1] ?? 'what', 1)
  }
  const stepView = isIntro(view) ? introView(view, t, () => nextIntro(view), () => go('what', 1)) : views[view]
  const back = backAction(backTarget(navigation, introRun), props.onBack, go)
  const close = props.onSkip ?? props.onContinueWithout
  const progress = isIntro(view) ? { position: ONBOARDING_INTRO_SCREENS.indexOf(view) + 1, total: ONBOARDING_INTRO_SCREENS.length } : onboardingGuidedPosition(view, cadencePath)
  const statusKey = runningStatusKey(props)

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
        onClose={close}
        orbitState={statusKey ? 'pensando' : 'parado'}
        statusText={statusKey ? t(statusKey) : undefined}
        options={stepView.options}
        primary={stepView.primary}
        footer={<>{stepView.footer}{props.notices}</>}
      >
        {stepView.free}
      </QuestionFlow>
    </FlowScreen>
  )
}

