import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import {
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  changeOnboardingScheduleMode,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingHabitTitle,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  readHabitPhrase,
  shouldRequestOnboardingSuggestion,
  type OnboardingSchedule,
  type OnboardingScheduleMode,
} from '@orbit/shared/utils'
import { DestinationTabBar } from '@/components/navigation/destination-tab-bar'
import { FlowShell } from '@/components/shell/flow-shell'
import { Shell412 } from '@/components/shell/shell-412'
import { Toast } from '@/components/ui/app-toast'
import { PillButton } from '@/components/ui/pill-button'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useProfile } from '@/hooks/use-profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingRemind, type ReminderState } from './onboarding-remind'
import { OnboardingWelcome } from './onboarding-welcome'
import { useOnboardingActions, useOnboardingIsLive } from './onboarding-actions-context'

type ReminderDecision = 'idle' | 'allowing' | 'declining'

function QuietAction({ label, onPress, disabled = false, loading = false }: Readonly<{ label: string; onPress: () => void; disabled?: boolean; loading?: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const unavailable = disabled || loading
  return <Pressable accessibilityRole="button" accessibilityState={{ busy: loading, disabled: unavailable }} disabled={unavailable} onPress={onPress} style={[styles.quiet, unavailable && styles.quietDisabled]}><Text style={[styles.quietText, { color: tokens.primarySoft }]}>{label}</Text></Pressable>
}
function ActionStack({ primary, secondary }: Readonly<{ primary: ReactNode; secondary?: ReactNode }>) { return <View style={styles.actions}>{primary}{secondary}</View> }

interface DecisionProps {
  step: number; sentence: string; locale: 'en' | 'pt-BR'; marks: ReturnType<typeof readHabitPhrase>['consumed']; isLive: boolean
  emoji: string; schedule: OnboardingSchedule; days: string[]; dueTime: string; proposed: boolean; correcting: boolean
  atLimit: boolean; allowance: number; createFailed: boolean; creating: boolean
  suggestionPending: boolean; reminderDecision: ReminderDecision; reminderState: ReminderState; createdTitle: string
  onAccount: () => void; onSentence: (value: string) => void; onContinueWhat: () => void
  onCorrect: () => void; onToggleDay: (day: string) => void
  onTime: (value: string) => void; onMode: (mode: OnboardingScheduleMode) => void; onFrequencyUnit: (unit: FrequencyUnit) => void
  onQuantity: (quantity: number) => void; onIntervalWeeks: (intervalWeeks: number) => void
  onSave: () => void; onAllow: () => void
  onContinueWithout: () => void; onSetTime: () => void
}

function DecisionContent(props: Readonly<DecisionProps>) {
  if (props.step === ONBOARDING_WHAT_STEP) return <OnboardingWelcome sentence={props.sentence} marks={props.marks} onChange={props.onSentence} onHaveAccount={!props.isLive ? props.onAccount : undefined} />
  if (props.step === ONBOARDING_WHEN_STEP) return <OnboardingCreateHabit title={getOnboardingHabitTitle(props.sentence, props.locale)} emoji={props.emoji} schedule={props.schedule} proposed={props.proposed} correcting={props.correcting} atLimit={props.atLimit} allowance={props.allowance} onCorrect={props.onCorrect} onToggleDay={props.onToggleDay} onTimeChange={props.onTime} onModeChange={props.onMode} onFrequencyUnitChange={props.onFrequencyUnit} onQuantityChange={props.onQuantity} onIntervalWeeksChange={props.onIntervalWeeks} />
  return <OnboardingRemind state={props.reminderState} title={props.createdTitle} dueTime={props.dueTime} />
}

function DecisionAction(props: Readonly<DecisionProps>) {
  const { t } = useTranslation()
  const decisionPending = props.reminderDecision !== 'idle'
  const allowing = props.reminderDecision === 'allowing'
  const declining = props.reminderDecision === 'declining'
  if (props.step === ONBOARDING_WHAT_STEP) return <PillButton disabled={!props.sentence.trim()} loading={props.suggestionPending} onClick={props.onContinueWhat}>{t('onboarding.flow.continue')}</PillButton>
  if (props.step === ONBOARDING_WHEN_STEP) return <PillButton loading={props.creating} onClick={props.onSave}>{t(`onboarding.flow.${props.createFailed ? 'retry' : 'create'}`)}</PillButton>
  if (props.reminderState === 'ask') return <ActionStack primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('onboarding.flow.remind.allow')}</PillButton>} secondary={<QuietAction disabled={decisionPending} loading={declining} label={t('onboarding.flow.remind.deny')} onPress={props.onContinueWithout} />} />
  if (props.reminderState === 'failed') return <ActionStack primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('onboarding.flow.retry')}</PillButton>} secondary={<QuietAction disabled={decisionPending} loading={declining} label={t('onboarding.flow.remind.continue')} onPress={props.onContinueWithout} />} />
  if (props.reminderState === 'no-time') return <ActionStack primary={<PillButton loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>} secondary={<QuietAction disabled={decisionPending} label={t('onboarding.flow.remind.setTime')} onPress={props.onSetTime} />} />
  return <PillButton loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>
}

function FlowHeader({ step, onBack, onSkip }: Readonly<{ step: number; onBack?: () => void; onSkip?: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const displayStep = getOnboardingDisplayStep(step)
  return <View style={styles.header}><View style={styles.headerStart}>{onBack && (step === ONBOARDING_WHEN_STEP || step === ONBOARDING_REMIND_STEP) ? <QuietAction label={t('onboarding.flow.back')} onPress={onBack} /> : null}<Text style={[styles.counter, { color: tokens.fg3 }]}>Orbit <Text style={{ color: tokens.fg1 }}>{String(displayStep).padStart(2, '0')}</Text> / {String(getOnboardingDisplayTotal()).padStart(2, '0')}</Text><Text accessibilityLiveRegion="polite" style={styles.srOnly}>{t('onboarding.flow.step', { current: displayStep, total: getOnboardingDisplayTotal() })}</Text></View>{onSkip ? <QuietAction label={t('onboarding.flow.skip')} onPress={onSkip} /> : null}</View>
}

export function OnboardingFlow() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen)
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en'
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const deferredPushFailure = useOnboardingDraftStore((state) => isLive && state.pushRegistrationFailed)
  const deferredHabit = useOnboardingDraftStore((state) => deferredPushFailure ? state.habits[0] : undefined)
  const [resolvingDeferredPush] = useState(deferredPushFailure)
  const { profile } = useProfile({ enabled: isLive })
  const suggestion = useHabitSuggestion()
  const push = usePushNotifications()
  const [step, setStep] = useState(resolvingDeferredPush ? ONBOARDING_REMIND_STEP : ONBOARDING_WHAT_STEP)
  const [sentence, setSentence] = useState('')
  const [emoji, setEmoji] = useState('◎')
  const [schedule, setSchedule] = useState<OnboardingSchedule>(() => deferredHabit ? { frequencyUnit: deferredHabit.frequencyUnit ?? null, frequencyQuantity: deferredHabit.frequencyQuantity ?? null, intervalWeeks: 1, days: deferredHabit.days ?? [], isGeneral: deferredHabit.isGeneral ?? false, isFlexible: deferredHabit.isFlexible ?? false, dueTime: deferredHabit.dueTime ?? '' } : buildOnboardingScheduleFromPhrase('', locale))
  const [proposed, setProposed] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(resolvingDeferredPush ? 'deferred' : null)
  const [createdTitle, setCreatedTitle] = useState(deferredHabit?.title ?? '')
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [reminderState, setReminderState] = useState<ReminderState>(resolvingDeferredPush ? 'failed' : 'ask')
  const [remindersOff, setRemindersOff] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [suggestionPending, setSuggestionPending] = useState(false)
  const [reminderDecision, setReminderDecision] = useState<ReminderDecision>('idle')
  const suggestionRevision = useRef(0)
  const read = useMemo(() => readHabitPhrase(sentence, locale), [locale, sentence])
  const { days, dueTime } = schedule
  const allowance = profile?.aiMessagesLimit ?? 5
  const atLimit = isLive && (profile?.aiMessagesUsed ?? 0) >= allowance

  async function continueFromWhat() {
    if (!sentence.trim() || suggestionPending) return
    setEmoji(read.emoji ?? '◎'); setSchedule(buildOnboardingScheduleFromPhrase(sentence, locale)); setProposed(false); setCorrecting(false)
    if (!shouldRequestOnboardingSuggestion({ isLive, atLimit })) { setStep(ONBOARDING_WHEN_STEP); return }
    const revision = suggestionRevision.current + 1
    suggestionRevision.current = revision
    setSuggestionPending(true)
    try {
      const result = await suggestion.mutateAsync({ title: sentence, language: locale })
      if (suggestionRevision.current !== revision) return
      setEmoji(result.emoji ?? read.emoji ?? '◎'); setSchedule(buildOnboardingScheduleFromSuggestion(result)); setProposed(true)
    } catch {
      if (suggestionRevision.current !== revision) return
      setCorrecting(true)
    } finally {
      if (suggestionRevision.current === revision) { setSuggestionPending(false); setStep(ONBOARDING_WHEN_STEP) }
    }
  }

  async function saveHabit() {
    if (creating) return
    setCreating(true); setCreateFailed(false)
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, days, dueTime, reminderEnabled: false, schedule })
    try {
      if (createdId) await actions.updateHabit(createdId, { ...input, isGeneral: schedule.isGeneral, isFlexible: schedule.isFlexible })
      else { const result = await actions.createHabit(input); setCreatedId(result.id) }
      setCreatedTitle(input.title)
      const refused = push.permissionStatus === 'denied' && !push.permissionCanAskAgain
      setReminderState(!dueTime ? 'no-time' : !push.isSupported ? 'unsupported' : refused ? 'refused' : 'ask'); setStep(ONBOARDING_REMIND_STEP)
    } catch { setCreateFailed(true) } finally { setCreating(false) }
  }

  async function persistReminderDecision(enabled: boolean): Promise<boolean> {
    if (!createdId || resolvingDeferredPush) return true
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, days, dueTime, reminderEnabled: enabled, schedule })
    try {
      await actions.updateHabit(createdId, input)
      return true
    } catch {
      setReminderState('failed')
      return false
    }
  }

  async function finishDeferredPushRecovery() {
    useOnboardingDraftStore.getState().reset()
    await actions.finishOnboarding()
  }

  async function allowReminders() {
    if (reminderDecision !== 'idle') return
    setReminderDecision('allowing')
    try {
      const outcome = await push.requestPermissionOutcome(isLive)
      if (outcome === 'granted') {
        if (resolvingDeferredPush) {
          await finishDeferredPushRecovery()
          return
        }
        if (!await persistReminderDecision(true)) return
        if (!isLive) actions.deferPushRegistration()
        setStep(ONBOARDING_DONE_STEP)
      }
      else if (await persistReminderDecision(false)) setReminderState(outcome)
    } finally {
      setReminderDecision('idle')
    }
  }
  async function continueWithoutReminders() {
    if (reminderDecision !== 'idle') return
    setReminderDecision('declining')
    try {
      if (resolvingDeferredPush) {
        await finishDeferredPushRecovery()
        return
      }
      if (!await persistReminderDecision(false)) return
      setRemindersOff(true)
      setStep(ONBOARDING_DONE_STEP)
    } finally {
      setReminderDecision('idle')
    }
  }
  function skip() { suggestionRevision.current += 1; setSuggestionPending(false); setSkipped(true); setCreatedTitle(''); setStep(ONBOARDING_DONE_STEP) }

  function runStepTransition(transition: () => void) {
    if (step === ONBOARDING_REMIND_STEP && reminderDecision !== 'idle') return
    transition()
  }

  function goBack() {
    runStepTransition(() => { if (step > 0) setStep(step - 1) })
  }

  if (astraConversationOpen) return null
  if (step === ONBOARDING_DONE_STEP) return <Modal visible animationType="none"><Shell412 tabBar={<DestinationTabBar pathname="/" />}><View style={styles.done}><OnboardingComplete createdHabit={createdTitle} emoji={emoji} remindersOff={remindersOff} skipped={skipped} signedOut={!isLive} onFinish={() => void actions.finishOnboarding()} /></View></Shell412></Modal>

  const decisionProps: DecisionProps = { step, sentence, locale, marks: read.consumed, isLive, emoji, schedule, days, dueTime, proposed, correcting, atLimit, allowance, createFailed, creating, suggestionPending, reminderDecision, reminderState, createdTitle, onAccount: () => router.replace('/login'), onSentence: (value) => { if (!suggestionPending) setSentence(value) }, onContinueWhat: () => void continueFromWhat(), onCorrect: () => setCorrecting(true), onToggleDay: (day) => setSchedule((current) => { const nextDays = current.days.includes(day) ? current.days.filter((value) => value !== day) : [...current.days, day]; return { ...current, days: nextDays, frequencyUnit: nextDays.length ? 'Day' : null, frequencyQuantity: nextDays.length ? 1 : null, isGeneral: nextDays.length === 0, isFlexible: false } }), onTime: (value) => setSchedule((current) => ({ ...current, dueTime: value })), onMode: (mode) => setSchedule((current) => changeOnboardingScheduleMode(current, mode)), onFrequencyUnit: (frequencyUnit) => setSchedule((current) => ({ ...current, frequencyUnit, days: [], isGeneral: false })), onQuantity: (frequencyQuantity) => setSchedule((current) => ({ ...current, frequencyQuantity })), onIntervalWeeks: (intervalWeeks) => setSchedule((current) => ({ ...current, intervalWeeks })), onSave: () => void saveHabit(), onAllow: () => void allowReminders(), onContinueWithout: () => void continueWithoutReminders(), onSetTime: () => runStepTransition(() => setStep(ONBOARDING_WHEN_STEP)) }
  return <Modal visible animationType="none" onRequestClose={() => runStepTransition(() => { if (resolvingDeferredPush) void finishDeferredPushRecovery(); else if (step > 0) setStep(step - 1) })}><FlowShell nav={false} header={<FlowHeader step={step} onBack={resolvingDeferredPush ? undefined : goBack} onSkip={createdId ? undefined : skip} />} action={<DecisionAction {...decisionProps} />} notice={createFailed ? <Toast kind="neutral" message={t('onboarding.flow.createFailed')} /> : undefined}><View style={styles.content}><DecisionContent {...decisionProps} /></View></FlowShell></Modal>
}

const styles = StyleSheet.create({ header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 12 }, headerStart: { alignItems: 'center', flexDirection: 'row', gap: 12 }, counter: { fontFamily: 'GeistMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: 0.48 }, srOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 }, content: { flexGrow: 1, justifyContent: 'center', maxWidth: 440, width: '100%' }, actions: { gap: 8 }, quiet: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 }, quietDisabled: { opacity: 0.5 }, quietText: { fontFamily: 'Geist_500Medium', fontSize: 13 }, done: { alignSelf: 'center', flex: 1, justifyContent: 'center', maxWidth: 440, paddingHorizontal: 24, width: '100%' } })
