import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  readHabitPhrase,
  shouldRequestOnboardingSuggestion,
  type OnboardingSchedule,
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
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingRemind, type ReminderState } from './onboarding-remind'
import { OnboardingWelcome } from './onboarding-welcome'
import { useOnboardingActions, useOnboardingIsLive } from './onboarding-actions-context'

function QuietAction({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.quiet}><Text style={[styles.quietText, { color: tokens.primarySoft }]}>{label}</Text></Pressable>
}
function ActionStack({ primary, secondary }: Readonly<{ primary: ReactNode; secondary?: ReactNode }>) { return <View style={styles.actions}>{primary}{secondary}</View> }

interface DecisionProps {
  step: number; sentence: string; marks: ReturnType<typeof readHabitPhrase>['consumed']; isLive: boolean
  emoji: string; days: string[]; dueTime: string; proposed: boolean; correcting: boolean
  atLimit: boolean; allowance: number; createFailed: boolean; creating: boolean
  suggestionPending: boolean; pushLoading: boolean; reminderState: ReminderState; createdTitle: string
  onAccount: () => void; onSentence: (value: string) => void; onContinueWhat: () => void
  onCorrect: () => void; onEmoji: (value: string) => void; onToggleDay: (day: string) => void
  onTime: (value: string) => void; onSave: () => void; onAllow: () => void
  onContinueWithout: () => void; onSetTime: () => void
}

function DecisionContent(props: Readonly<DecisionProps>) {
  if (props.step === ONBOARDING_WHAT_STEP) return <OnboardingWelcome sentence={props.sentence} marks={props.marks} onChange={props.onSentence} onHaveAccount={!props.isLive ? props.onAccount : undefined} />
  if (props.step === ONBOARDING_WHEN_STEP) return <OnboardingCreateHabit emoji={props.emoji} days={props.days} dueTime={props.dueTime} proposed={props.proposed} correcting={props.correcting} atLimit={props.atLimit} allowance={props.allowance} onCorrect={props.onCorrect} onEmojiChange={props.onEmoji} onToggleDay={props.onToggleDay} onTimeChange={props.onTime} />
  return <OnboardingRemind state={props.reminderState} title={props.createdTitle} dueTime={props.dueTime} />
}

function DecisionAction(props: Readonly<DecisionProps>) {
  const { t } = useTranslation()
  if (props.step === ONBOARDING_WHAT_STEP) return <PillButton disabled={!props.sentence.trim()} loading={props.suggestionPending} onClick={props.onContinueWhat}>{t('onboarding.flow.continue')}</PillButton>
  if (props.step === ONBOARDING_WHEN_STEP) return <PillButton loading={props.creating} onClick={props.onSave}>{t(`onboarding.flow.${props.createFailed ? 'retry' : 'create'}`)}</PillButton>
  if (props.reminderState === 'ask') return <ActionStack primary={<PillButton loading={props.pushLoading} onClick={props.onAllow}>{t('onboarding.flow.remind.allow')}</PillButton>} secondary={<QuietAction label={t('onboarding.flow.remind.deny')} onPress={props.onContinueWithout} />} />
  if (props.reminderState === 'failed') return <ActionStack primary={<PillButton onClick={props.onAllow}>{t('onboarding.flow.retry')}</PillButton>} secondary={<QuietAction label={t('onboarding.flow.remind.continue')} onPress={props.onContinueWithout} />} />
  if (props.reminderState === 'no-time') return <ActionStack primary={<PillButton onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>} secondary={<QuietAction label={t('onboarding.flow.remind.setTime')} onPress={props.onSetTime} />} />
  return <PillButton onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>
}

function FlowHeader({ step, onBack, onSkip }: Readonly<{ step: number; onBack: () => void; onSkip?: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const displayStep = getOnboardingDisplayStep(step)
  return <View style={styles.header}><View style={styles.headerStart}>{step === ONBOARDING_WHEN_STEP || step === ONBOARDING_REMIND_STEP ? <QuietAction label={t('onboarding.flow.back')} onPress={onBack} /> : null}<Text style={[styles.counter, { color: tokens.fg3 }]}>Orbit <Text style={{ color: tokens.fg1 }}>{String(displayStep).padStart(2, '0')}</Text> / {String(getOnboardingDisplayTotal()).padStart(2, '0')}</Text><Text accessibilityLiveRegion="polite" style={styles.srOnly}>{t('onboarding.flow.step', { current: displayStep, total: getOnboardingDisplayTotal() })}</Text></View>{onSkip ? <QuietAction label={t('onboarding.flow.skip')} onPress={onSkip} /> : null}</View>
}

export function OnboardingFlow() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen)
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en'
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const { profile } = useProfile({ enabled: isLive })
  const suggestion = useHabitSuggestion()
  const push = usePushNotifications()
  const [step, setStep] = useState(ONBOARDING_WHAT_STEP)
  const [sentence, setSentence] = useState('')
  const [emoji, setEmoji] = useState('◎')
  const [schedule, setSchedule] = useState<OnboardingSchedule>(() => buildOnboardingScheduleFromPhrase('', locale))
  const [proposed, setProposed] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [createdTitle, setCreatedTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [reminderState, setReminderState] = useState<ReminderState>('ask')
  const [remindersOff, setRemindersOff] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [suggestionPending, setSuggestionPending] = useState(false)
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
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, days, dueTime, schedule })
    try {
      if (createdId) await actions.updateHabit(createdId, input)
      else { const result = await actions.createHabit(input); setCreatedId(result.id) }
      setCreatedTitle(input.title)
      const refused = push.permissionStatus === 'denied' && !push.permissionCanAskAgain
      setReminderState(!dueTime ? 'no-time' : !push.isSupported ? 'unsupported' : refused ? 'refused' : 'ask'); setStep(ONBOARDING_REMIND_STEP)
    } catch { setCreateFailed(true) } finally { setCreating(false) }
  }

  async function allowReminders() {
    const outcome = await push.requestPermissionOutcome(isLive)
    if (outcome === 'granted') setStep(ONBOARDING_DONE_STEP)
    else setReminderState(outcome)
  }
  function continueWithoutReminders() { setRemindersOff(true); setStep(ONBOARDING_DONE_STEP) }
  function skip() { suggestionRevision.current += 1; setSuggestionPending(false); setSkipped(true); setCreatedTitle(''); setStep(ONBOARDING_DONE_STEP) }

  if (astraConversationOpen) return null
  if (step === ONBOARDING_DONE_STEP) return <Modal visible animationType="none"><Shell412 tabBar={<DestinationTabBar pathname="/" />}><View style={styles.done}><OnboardingComplete createdHabit={createdTitle} emoji={emoji} remindersOff={remindersOff} skipped={skipped} signedOut={!isLive} onFinish={() => void actions.finishOnboarding()} /></View></Shell412></Modal>

  const decisionProps: DecisionProps = { step, sentence, marks: read.consumed, isLive, emoji, days, dueTime, proposed, correcting, atLimit, allowance, createFailed, creating, suggestionPending, pushLoading: push.isLoading, reminderState, createdTitle, onAccount: () => router.replace('/login'), onSentence: (value) => { if (!suggestionPending) setSentence(value) }, onContinueWhat: () => void continueFromWhat(), onCorrect: () => setCorrecting(true), onEmoji: setEmoji, onToggleDay: (day) => setSchedule((current) => { const nextDays = current.days.includes(day) ? current.days.filter((value) => value !== day) : [...current.days, day]; return { ...current, days: nextDays, frequencyUnit: nextDays.length ? 'Day' : null, frequencyQuantity: nextDays.length ? 1 : null, intervalWeeks: 1, isGeneral: nextDays.length === 0, isFlexible: false } }), onTime: (value) => setSchedule((current) => ({ ...current, dueTime: value })), onSave: () => void saveHabit(), onAllow: () => void allowReminders(), onContinueWithout: continueWithoutReminders, onSetTime: () => setStep(ONBOARDING_WHEN_STEP) }
  return <Modal visible animationType="none" onRequestClose={() => { if (step > 0) setStep(step - 1) }}><FlowShell nav={false} header={<FlowHeader step={step} onBack={() => setStep(step - 1)} onSkip={createdId ? undefined : skip} />} action={<DecisionAction {...decisionProps} />} notice={createFailed ? <Toast kind="neutral" message={t('onboarding.flow.createFailed')} /> : undefined}><View style={styles.content}><DecisionContent {...decisionProps} /></View></FlowShell></Modal>
}

const styles = StyleSheet.create({ header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 12 }, headerStart: { alignItems: 'center', flexDirection: 'row', gap: 12 }, counter: { fontFamily: 'GeistMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: 0.48 }, srOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 }, content: { flexGrow: 1, justifyContent: 'center', maxWidth: 440, width: '100%' }, actions: { gap: 8 }, quiet: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 }, quietText: { fontFamily: 'Geist_500Medium', fontSize: 13 }, done: { alignSelf: 'center', flex: 1, justifyContent: 'center', maxWidth: 440, paddingHorizontal: 24, width: '100%' } })
