import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { API } from '@orbit/shared/api'
import {
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  changeOnboardingScheduleMode,
  clampOnboardingRepeatWeeks,
  getClientTimeZone,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getHabitPhraseTitle,
  isOnboardingHabitDueToday,
  ONBOARDING_DONE_STEP,
  ONBOARDING_PRO_STEP,
  getCurrentPlan,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  readHabitPhrase,
  shouldRequestOnboardingSuggestion,
  toggleOnboardingScheduleDay,
  type OnboardingRemindState,
  type OnboardingSchedule,
  type OnboardingScheduleMode,
} from '@orbit/shared/utils'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { FlowShell } from '@/components/shell/flow-shell'
import { Shell412 } from '@/components/shell/shell-412'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { Toast } from '@/components/ui/app-toast'
import { PillButton } from '@/components/ui/pill-button'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useProfile } from '@/hooks/use-profile'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { accountTimezoneDependency, isQueuedResult } from '@/lib/offline-mutations'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { OnboardingProStep, type OnboardingProExit } from './onboarding-pro-step'
import { setOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getAccountId } from '@/lib/account-scope'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingRemind } from './onboarding-remind'
import { OnboardingWelcome } from './onboarding-welcome'
import { useOnboardingActions, useOnboardingIsLive } from './onboarding-actions-context'

type ReminderDecision = 'idle' | 'allowing' | 'declining'

function ActionStack({ primary, secondary }: Readonly<{ primary: ReactNode; secondary?: ReactNode }>) { return <View style={styles.actions}>{primary}{secondary}</View> }

const DONE_TAB_ROUTES = { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' } as const
type DoneTabRoute = (typeof DONE_TAB_ROUTES)[keyof typeof DONE_TAB_ROUTES]

function DoneTabBar({ onSelect }: Readonly<{ onSelect: (id: string) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <BottomTabBar activeId="hoje" label={t('nav.mainNavigation')} onSelect={onSelect}
    items={[
      { id: 'hoje', label: t('nav.today'), icon: ({ active }) => <Home size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg3} /> },
      { id: 'calendario', label: t('nav.calendar'), icon: ({ active }) => <CalendarDays size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg3} /> },
      { id: 'progresso', label: t('nav.progress'), icon: ({ active }) => <ChartLine size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg3} /> },
      { id: 'perfil', label: t('nav.profile'), icon: ({ active }) => <User size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg3} /> },
    ]} />
}

function DoneScroll({ children }: Readonly<{ children: ReactNode }>) {
  const { width } = useWindowDimensions()
  const clearance = useShellScrollerClearance()
  return <ScrollView style={styles.doneScroll} contentContainerStyle={[styles.done, { maxWidth: width >= 1024 ? 560 : 440 }, { paddingBottom: clearance }]}>{children}</ScrollView>
}

interface DecisionProps {
  step: number; sentence: string; locale: 'en' | 'pt-BR'; marks: ReturnType<typeof readHabitPhrase>['consumed']; isLive: boolean
  emoji: string; schedule: OnboardingSchedule; dueTime: string; proposed: boolean; correcting: boolean
  atLimit: boolean; allowance: number; createFailed: boolean; creating: boolean
  suggestionPending: boolean; reminderDecision: ReminderDecision; reminderState: OnboardingRemindState; createdTitle: string
  onAccount: () => void; onSentence: (value: string) => void; onContinueWhat: () => void
  onCorrect: () => void; onToggleDay: (day: string) => void
  onTime: (value: string) => void; onMode: (mode: OnboardingScheduleMode) => void; onFrequencyUnit: (unit: FrequencyUnit) => void
  onQuantity: (quantity: number) => void; onIntervalWeeks: (intervalWeeks: number) => void
  onSave: () => void; onAllow: () => void
  onContinueWithout: () => void; onEditSchedule: () => void
}

function DecisionContent(props: Readonly<DecisionProps>) {
  if (props.step === ONBOARDING_WHAT_STEP) return <OnboardingWelcome sentence={props.sentence} marks={props.marks} onChange={props.onSentence} />
  if (props.step === ONBOARDING_WHEN_STEP) return <OnboardingCreateHabit title={getHabitPhraseTitle(props.sentence, props.locale)} emoji={props.emoji} schedule={props.schedule} proposed={props.proposed} correcting={props.correcting} canSaveRepeatWeeks={props.isLive} atLimit={props.atLimit} allowance={props.allowance} onCorrect={props.onCorrect} onToggleDay={props.onToggleDay} onTimeChange={props.onTime} onModeChange={props.onMode} onFrequencyUnitChange={props.onFrequencyUnit} onQuantityChange={props.onQuantity} onIntervalWeeksChange={props.onIntervalWeeks} />
  return <OnboardingRemind state={props.reminderState} title={props.createdTitle} dueTime={props.dueTime} isLive={props.isLive} />
}

function DecisionAction(props: Readonly<DecisionProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const decisionPending = props.reminderDecision !== 'idle'
  const allowing = props.reminderDecision === 'allowing'
  const declining = props.reminderDecision === 'declining'
  if (props.step === ONBOARDING_WHAT_STEP) {
    const empty = !props.sentence.trim()
    const reason = t('onboarding.flow.what.continueReason')
    return <ActionStack primary={<>
      <PillButton disabled={empty} loading={props.suggestionPending} hint={empty ? reason : undefined} onClick={props.onContinueWhat}>{t('onboarding.flow.continue')}</PillButton>
      {empty ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{reason}</Text> : null}
    </>} secondary={!props.isLive ? <>
      {/* eslint-disable-next-line local/max-button-words -- The granted onboarding drawing uses this account action label. */}
      <PillButton variant="ghost" onClick={props.onAccount}>{t('onboarding.flow.what.haveAccount')}</PillButton>
    </> : undefined} />
  }
  if (props.step === ONBOARDING_WHEN_STEP) return <PillButton loading={props.creating} onClick={props.onSave}>{t(`onboarding.flow.${props.createFailed ? 'retry' : 'create'}`)}</PillButton>
  if (props.reminderState === 'ask') return <ActionStack primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('onboarding.flow.remind.allow')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.deny')}</PillButton>} />
  if (props.reminderState === 'failed') return <ActionStack primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('onboarding.flow.retry')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>} />
  if (props.reminderState === 'no-time' || props.reminderState === 'no-day') return <ActionStack primary={<PillButton loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} onClick={props.onEditSchedule}>{t(props.reminderState === 'no-day' ? 'onboarding.flow.remind.setDays' : 'onboarding.flow.remind.setTime')}</PillButton>} />
  return <PillButton loading={declining} onClick={props.onContinueWithout}>{t('onboarding.flow.remind.continue')}</PillButton>
}

function FlowHeader({ step, onBack, onSkip }: Readonly<{ step: number; onBack?: () => void; onSkip?: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const displayStep = getOnboardingDisplayStep(step)
  return <View style={styles.header}><View style={styles.headerStart}>{onBack && (step === ONBOARDING_WHEN_STEP || step === ONBOARDING_REMIND_STEP) ? <PillButton variant="ghost" size="sm" onClick={onBack}>{t('onboarding.flow.back')}</PillButton> : null}<Text style={[styles.counter, { color: tokens.fg3 }]}>Orbit · <Text style={{ color: tokens.fg1 }}>{String(displayStep).padStart(2, '0')}</Text> / {String(getOnboardingDisplayTotal()).padStart(2, '0')}</Text><Text accessibilityLiveRegion="polite" style={styles.srOnly}>{t('onboarding.flow.step', { current: displayStep, total: getOnboardingDisplayTotal() })}</Text></View>{onSkip ? <PillButton variant="ghost" size="sm" onClick={onSkip}>{t('onboarding.flow.skip')}</PillButton> : null}</View>
}

export function OnboardingFlow({ finalStepOnly = false }: Readonly<{ finalStepOnly?: boolean }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen)
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en'
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const deferredPushFailure = useOnboardingDraftStore((state) => isLive && state.pushRegistrationFailed)
  const deferredHabit = useOnboardingDraftStore((state) => deferredPushFailure ? state.habits[0] : undefined)
  const [resolvingDeferredPush] = useState(deferredPushFailure)
  const { profile, refetch: refetchProfile } = useProfile({ enabled: isLive })
  const suggestion = useHabitSuggestion()
  const push = usePushNotifications()
  const [step, setStep] = useState(finalStepOnly ? ONBOARDING_PRO_STEP : resolvingDeferredPush ? ONBOARDING_REMIND_STEP : ONBOARDING_WHAT_STEP)
  const [sentence, setSentence] = useState('')
  const [emoji, setEmoji] = useState('◎')
  const [schedule, setSchedule] = useState<OnboardingSchedule>(() => deferredHabit ? { frequencyUnit: deferredHabit.frequencyUnit ?? null, frequencyQuantity: deferredHabit.frequencyQuantity ?? null, intervalWeeks: 1, days: deferredHabit.days ?? [], isGeneral: deferredHabit.isGeneral ?? false, isFlexible: deferredHabit.isFlexible ?? false, dueTime: deferredHabit.dueTime ?? '' } : buildOnboardingScheduleFromPhrase('', locale))
  const [proposed, setProposed] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(resolvingDeferredPush ? 'deferred' : null)
  const [createdTitle, setCreatedTitle] = useState(deferredHabit?.title ?? '')
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [reminderState, setReminderState] = useState<OnboardingRemindState>(resolvingDeferredPush ? 'failed' : 'ask')
  const [remindersOff, setRemindersOff] = useState(false)
  const [createdDueToday, setCreatedDueToday] = useState(true)
  const [createdGeneral, setCreatedGeneral] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [suggestionPending, setSuggestionPending] = useState(false)
  const [reminderDecision, setReminderDecision] = useState<ReminderDecision>('idle')
  const [overlayOpen, setOverlayOpen] = useState(true)
  const [destinationAfterPro, setDestinationAfterPro] = useState<string | undefined>()
  const proStepRef = useRef<OnboardingProExit>(null)
  const suggestionRevision = useRef(0)
  const read = useMemo(() => readHabitPhrase(sentence, locale), [locale, sentence])
  const { dueTime } = schedule
  const allowance = profile?.aiMessagesLimit ?? 5
  const atLimit = isLive && (profile?.aiMessagesUsed ?? 0) >= allowance

  async function continueFromWhat() {
    if (!sentence.trim() || suggestionPending) return
    setEmoji(read.emoji ?? '◎'); setSchedule(clampOnboardingRepeatWeeks(buildOnboardingScheduleFromPhrase(sentence, locale), isLive)); setProposed(false); setCorrecting(false)
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

  function resolveReminderState(): OnboardingRemindState {
    if (schedule.isGeneral) return 'no-day'
    if (!dueTime) return 'no-time'
    if (!push.isSupported) return 'unsupported'
    return push.permissionStatus === 'denied' && !push.permissionCanAskAgain ? 'refused' : 'ask'
  }

  async function saveHabit() {
    if (creating) return
    setCreating(true); setCreateFailed(false)
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, reminderEnabled: false, schedule })
    try {
      const accountProfile = isLive ? profile ?? (await refetchProfile()).data : undefined
      if (isLive && !accountProfile) throw new Error('Profile unavailable')
      const accountTimeZone = accountProfile?.timeZone ?? getClientTimeZone()
      let timezoneDependency: string | undefined
      if (isLive && accountProfile?.timeZone == null && accountTimeZone && accountTimeZone !== 'UTC') {
        const timezoneResult = await performQueuedApiMutation({ type: 'setTimeZone', scope: 'profile', endpoint: API.profile.timezone, method: 'PUT', payload: { timeZone: accountTimeZone }, dedupeKey: 'profile-timezone-auto' })
        if (isQueuedResult(timezoneResult)) timezoneDependency = accountTimezoneDependency(timezoneResult.queuedMutationId)
      }
      if (createdId) await actions.updateHabit(createdId, { ...input, isGeneral: schedule.isGeneral, isFlexible: schedule.isFlexible }, ...(timezoneDependency ? [timezoneDependency] : []))
      else { const result = await actions.createHabit(input, ...(timezoneDependency ? [timezoneDependency] : [])); setCreatedId(result.id) }
      setCreatedTitle(input.title)
      setCreatedDueToday(isOnboardingHabitDueToday(schedule, new Date(), accountTimeZone))
      setCreatedGeneral(schedule.isGeneral)
      setReminderState(resolveReminderState()); setStep(ONBOARDING_REMIND_STEP)
    } catch { setCreateFailed(true) } finally { setCreating(false) }
  }

  async function persistReminderDecision(enabled: boolean): Promise<boolean> {
    if (!createdId || resolvingDeferredPush) return true
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, reminderEnabled: enabled, schedule })
    try {
      await actions.updateHabit(createdId, input)
      return true
    } catch {
      setReminderState('failed')
      return false
    }
  }

  async function finishDeferredPushRecovery() {
    const generation = getAccountGeneration()
    if (getCurrentPlan(profile) === 'Pro') {
      await actions.finishOnboarding()
      if (getAccountGeneration() === generation) useOnboardingDraftStore.getState().reset()
      return
    }
    const accountId = getAccountId()
    if (accountId !== null) await setOnboardingProPending(accountId, true)
    if (getAccountGeneration() !== generation) return
    useOnboardingDraftStore.getState().reset()
    setStep(ONBOARDING_PRO_STEP)
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

  /**
   * The one exit for the done button, the done tab bar and the Android back gesture: the modal has to
   * close first, because this flow is mounted globally and would otherwise cover the destination.
   */
  async function finishAndLeave(destination = destinationAfterPro) {
    const accountId = getAccountId()
    const generation = getAccountGeneration()
    await actions.finishOnboarding()
    if (getAccountGeneration() !== generation) return
    if (resolvingDeferredPush) useOnboardingDraftStore.getState().reset()
    if (accountId !== null) await setOnboardingProPending(accountId, false)
    if (getAccountGeneration() !== generation) return
    setOverlayOpen(false)
    if (destination) router.navigate(destination)
  }

  function completeAndLeave(destination?: DoneTabRoute) {
    if (step === ONBOARDING_PRO_STEP) { proStepRef.current?.exit(destination); return }
    if (isLive && step === ONBOARDING_DONE_STEP && getCurrentPlan(profile) !== 'Pro') { setDestinationAfterPro(destination); setStep(ONBOARDING_PRO_STEP); return }
    void finishAndLeave(destination)
  }

  function runStepTransition(transition: () => void) {
    if (step === ONBOARDING_REMIND_STEP && reminderDecision !== 'idle') return
    transition()
  }

  function goBack() {
    runStepTransition(() => { if (step > 0) setStep(step - 1) })
  }

  if (astraConversationOpen) return null
  if (step === ONBOARDING_PRO_STEP) return <Modal visible={overlayOpen} animationType="none" onRequestClose={() => completeAndLeave()}><Shell412 tabBar={<DoneTabBar onSelect={(id) => completeAndLeave(DONE_TAB_ROUTES[id as keyof typeof DONE_TAB_ROUTES])} />}><DoneScroll><OnboardingProStep ref={proStepRef} onFinish={finishAndLeave} /></DoneScroll></Shell412></Modal>
  if (step === ONBOARDING_DONE_STEP) return <Modal visible={overlayOpen} animationType="none" onRequestClose={() => void completeAndLeave()}><Shell412 tabBar={<DoneTabBar onSelect={(id) => void completeAndLeave(isLive ? DONE_TAB_ROUTES[id as keyof typeof DONE_TAB_ROUTES] : undefined)} />}><DoneScroll><OnboardingComplete createdHabit={createdTitle} emoji={emoji} remindersOff={remindersOff} skipped={skipped} signedOut={!isLive} continuesToPro={isLive && getCurrentPlan(profile) !== 'Pro'} dueToday={createdDueToday} general={createdGeneral} onFinish={() => void completeAndLeave()} /></DoneScroll></Shell412></Modal>

  const decisionProps: DecisionProps = { step, sentence, locale, marks: read.consumed, isLive, emoji, schedule, dueTime, proposed, correcting, atLimit, allowance, createFailed, creating, suggestionPending, reminderDecision, reminderState, createdTitle, onAccount: () => router.replace('/login'), onSentence: (value) => { if (!suggestionPending) setSentence(value) }, onContinueWhat: () => void continueFromWhat(), onCorrect: () => setCorrecting(true), onToggleDay: (day) => setSchedule((current) => toggleOnboardingScheduleDay(current, day)), onTime: (value) => setSchedule((current) => ({ ...current, dueTime: value })), onMode: (mode) => setSchedule((current) => changeOnboardingScheduleMode(current, mode)), onFrequencyUnit: (frequencyUnit) => setSchedule((current) => ({ ...current, frequencyUnit, days: [], isGeneral: false })), onQuantity: (frequencyQuantity) => setSchedule((current) => ({ ...current, frequencyQuantity })), onIntervalWeeks: (intervalWeeks) => setSchedule((current) => ({ ...current, intervalWeeks })), onSave: () => void saveHabit(), onAllow: () => void allowReminders(), onContinueWithout: () => void continueWithoutReminders(), onEditSchedule: () => runStepTransition(() => setStep(ONBOARDING_WHEN_STEP)) }
  return <Modal visible animationType="none" onRequestClose={() => runStepTransition(() => { if (resolvingDeferredPush) void finishDeferredPushRecovery(); else if (step > 0) setStep(step - 1) })}><FlowShell nav={false} header={<FlowHeader step={step} onBack={resolvingDeferredPush ? undefined : goBack} onSkip={createdId ? undefined : skip} />} action={<DecisionAction {...decisionProps} />} notice={createFailed ? <Toast kind="neutral" message={t('onboarding.flow.createFailed')} /> : undefined}><View style={styles.content}><DecisionContent {...decisionProps} /></View></FlowShell></Modal>
}

const styles = StyleSheet.create({ header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 12 }, headerStart: { alignItems: 'center', flexDirection: 'row', gap: 12 }, counter: { fontFamily: 'GeistMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: 0.48 }, srOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 }, content: { flexGrow: 1, justifyContent: 'center', maxWidth: 440, width: '100%' }, actions: { gap: 8 }, reason: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' }, doneScroll: { flex: 1 }, done: { alignSelf: 'center', flexGrow: 1, justifyContent: 'center', maxWidth: 440, paddingHorizontal: 24, width: '100%' } })
