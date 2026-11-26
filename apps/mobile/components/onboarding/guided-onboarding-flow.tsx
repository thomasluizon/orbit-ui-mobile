import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import type { FlowStepView, QuestionFlowProps } from '@orbit/shared/contracts/flow'
import {
  buildOnboardingScheduleFromPhrase,
  canRepeatOnboardingScheduleWeeks,
  createOrbitAllowanceTranslator,
  getHabitPhraseTitle,
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
import { createStyles as createFormStyles } from '@/components/habits/habit-form-fields/styles'
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
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
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
  windowOpen?: boolean
  onWindowDismissed?: () => void
  /** The current shell notices: the create failure and the read verification. */
  notices: ReactNode
  /** Absent while a deferred push registration is recovered. */
  onBack?: () => void
  /** Leaves onboarding. Absent once the habit exists. */
  onSkip?: () => void
  /** The close after Create did not save the habit. The remind step states it with its own failure. */
  leaveFailed: boolean
}

type Translate = ReturnType<typeof useTranslation>['t']
type Tokens = ReturnType<typeof createTokensV2>

type StepView = FlowStepView & Pick<QuestionFlowProps, 'footer'>

function useTokens(): Tokens {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
}

function useValueFormat(): FlowValueFormat {
  const { t, i18n } = useTranslation()
  const { displayTime } = useTimeFormat()
  return { translate: (key, values) => t(key, values), locale: i18n.language, displayTime }
}

function useCadenceText(schedule: OnboardingSchedule) {
  const format = useValueFormat()
  return (timed: boolean) => formatOnboardingCadence(schedule, timed, format)
}

function IntroSentence({ children }: Readonly<{ children: string }>) {
  const tokens = useTokens()
  const reducedMotion = usePrefersReducedMotion()
  const [entrance] = useState(() => new Animated.Value(reducedMotion ? 1 : 0))
  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return }
    entrance.setValue(0)
    const animation = Animated.timing(entrance, { toValue: 1, delay: motionLayerTiming.contentStagger, duration: motionDurations.slow, easing: Easing.bezier(...motionEasings.enter), useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [children, entrance, reducedMotion])
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0] })
  return (
    <Animated.View testID="intro-sentence" style={{ opacity: entrance, transform: [{ translateY }] }}>
      <Text style={[styles.sentence, { color: tokens.fg2 }]}>{children}</Text>
    </Animated.View>
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
  const { t } = useTranslation()
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

function daysView(props: GuidedOnboardingProps, t: Translate, tokens: Tokens, onDone: () => void): StepView {
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
        moreLabel={t('onboarding.flow.when.intervalMore')} description={t('onboarding.flow.when.interval', { count: props.schedule.intervalWeeks })} colors={tokens} onChange={props.onIntervalWeeks} /> : null}
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

function countView(props: GuidedOnboardingProps, t: Translate, tokens: Tokens, kind: 'quantity' | 'interval', onDone: () => void): StepView {
  const count = props.schedule.frequencyQuantity ?? 1
  const unit = (props.schedule.frequencyUnit ?? (kind === 'quantity' ? 'Week' : 'Day')).toLowerCase()
  const description = kind === 'quantity' ? t(`onboarding.flow.when.quantityUnit.${unit}`, { count }) : t(`onboarding.flow.when.cadence.intervalUnit.${unit}`, { count })
  return {
    question: t(`onboarding.flow.guided.${kind}.question`),
    line: null,
    free: <Stepper value={count} minimum={1} lessLabel={t(kind === 'quantity' ? 'onboarding.flow.when.quantityLess' : 'onboarding.flow.when.frequencyLess')}
      moreLabel={t(kind === 'quantity' ? 'onboarding.flow.when.quantityMore' : 'onboarding.flow.when.frequencyMore')} description={description} colors={tokens} onChange={props.onQuantity} />,
    primary: { label: t('onboarding.flow.continue'), onPress: onDone },
  }
}

function useTimeView(props: GuidedOnboardingProps, onDone: () => void): StepView {
  const { t } = useTranslation()
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
  const { t, i18n } = useTranslation()
  const tokens = useTokens()
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const translate = createOrbitAllowanceTranslator(t, { aiMessagesPeriod: props.allowancePeriod }, i18n.language)
  const value = useSummaryValue(props, habitTitle)
  const row = (step: OnboardingQuestionStep) => {
    const label = t(`onboarding.flow.guided.summary.${step}`)
    return (
      <Proposed key={step} proposed={props.proposed && step !== 'what'} scope="row" label={t('onboarding.flow.when.proposedBy')} keepMounted>
        <ListRow placement="field" title={label} value={value(step)} accessibilityLabel={`${label}, ${value(step)}`} onClick={() => open(step)} />
      </Proposed>
    )
  }
  return {
    question: t('onboarding.flow.guided.summary.question'),
    line: t('habits.flow.what.lineUnderstood', { parts: cadenceText(true) }),
    free: <View testID="onboarding-summary" accessibilityLabel={t('onboarding.flow.guided.summary.question')} style={styles.group}>
      <View style={styles.titleRow}>
        <HabitEmojiSelector tokens={tokens} styles={formStyles} selectedEmoji={props.habitEmoji} proposed={props.emojiProposed} onSelect={props.onEmoji} />
        <View style={styles.titleValue}>{row('what')}</View>
      </View>
      {row('mode')}
      {onboardingModeDetailSteps(getOnboardingScheduleMode(props.schedule)).map(row)}
      {row('time')}
      {props.atLimit ? <CapacityNotice message={translate('onboarding.flow.when.limit', { allowance: props.allowance })} /> : null}
      {props.createFailed ? <Text accessibilityRole="alert" style={[styles.alert, { color: tokens.statusBadText }]}>{t('onboarding.flow.createFailed')}</Text> : null}
    </View>,
    primary: { label: t(props.createFailed ? 'onboarding.flow.retry' : 'onboarding.flow.create'), onPress: props.onSave, loading: props.creating },
  }
}

function ReminderPreview({ title, time }: Readonly<{ title: string; time: string }>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  return (
    <View style={[styles.preview, { backgroundColor: tokens.bgWell }]}>
      <View style={styles.previewHead}>
        <View accessible={false} importantForAccessibility="no-hide-descendants"><OrbitMascot size={16} /></View>
        <Text style={[styles.previewMeta, { color: tokens.fg3 }]}>Orbit</Text>
        <View style={styles.spacer} />
        <Text style={[styles.previewMeta, { color: tokens.fg3 }]}>{time}</Text>
      </View>
      <Text style={[styles.previewTitle, { color: tokens.fg1 }]}>{title}</Text>
      <Text style={[styles.previewBody, { color: tokens.fg2 }]}>{t('onboarding.flow.remind.notificationBody')}</Text>
    </View>
  )
}

function useRemindView(props: GuidedOnboardingProps, onEdit: (step: OnboardingQuestionStep) => void): StepView {
  const { t } = useTranslation()
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
  const base = { question: t(`onboarding.flow.remind.${titleKey}`), line: null, free: <IntroSentence>{t(`onboarding.flow.remind.${bodyKey}`)}</IntroSentence> }
  if (props.reminderState === 'failed') return { ...base, options: <><OptionCard label={t('onboarding.flow.retry')} onSelect={props.onAllow} />{continueOption}</> }
  if (props.reminderState === 'no-time') return { ...base, options: <><OptionCard label={t('onboarding.flow.remind.setTime')} onSelect={() => onEdit('time')} />{continueOption}</> }
  if (props.reminderState === 'no-day') return { ...base, options: <><OptionCard label={t('onboarding.flow.remind.setDays')} onSelect={() => onEdit('days')} />{continueOption}</> }
  return { ...base, primary: { label: t('onboarding.flow.remind.continue'), onPress: props.onContinueWithout, loading: props.reminderDecision === 'declining' } }
}

/** The guided onboarding: the intro, then one question at a time on the shared flow shell. The state, the requests and the reminder logic stay in `OnboardingFlow`. */
export function GuidedOnboardingFlow(props: Readonly<GuidedOnboardingProps>) {
  const { t, i18n } = useTranslation()
  const tokens = useTokens()
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en'
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
    days: daysView(props, t, tokens, toSummary),
    quantity: countView(props, t, tokens, 'quantity', toSummary),
    interval: countView(props, t, tokens, 'interval', toSummary),
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
    <FlowScreen label={t('onboarding.flow.guided.screenLabel')} onDismiss={back ?? close} open={props.windowOpen} onDismissed={props.onWindowDismissed}>
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
          {props.leaveFailed && view !== 'remind' ? <Text accessibilityRole="alert" style={[styles.alert, { color: tokens.statusBadText }]}>{t('onboarding.flow.completionFailed')}</Text> : null}
          {stepView.footer}{props.notices}
        </>}
      >
        {stepView.free}
      </QuestionFlow>
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  sentence: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26, textAlign: 'center' },
  group: { gap: 12 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  titleValue: { flex: 1, minWidth: 0 },
  alert: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
  preview: { borderRadius: 12, gap: 4, padding: 16 },
  previewHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  previewMeta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
  spacer: { flex: 1 },
  previewTitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22 },
  previewBody: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
