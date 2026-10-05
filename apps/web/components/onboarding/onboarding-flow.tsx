'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ShellWideItem } from '@orbit/shared/contracts/shell'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
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
import { ShellWide } from '@/components/shell/shell-wide'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { ActionRow } from '@/components/ui/action-row'
import { PillButton } from '@/components/ui/pill-button'
import { Toast } from '@/components/ui/toast'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useProfile } from '@/hooks/use-profile'
import { updateTimezone } from '@/lib/actions/profile'
import { requestWebPushPermission, subscribeToPushNotifications, usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { getOnboardingLoginUrl } from '@/lib/onboarding-login-route'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getHeldAccountId } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { OnboardingProStep, type OnboardingProExit } from './onboarding-pro-step'
import { setOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import { getAccountGeneration } from '@/lib/session-epoch'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingRemind } from './onboarding-remind'
import { OnboardingWelcome } from './onboarding-welcome'
import { useOnboardingActions, useOnboardingIsLive } from './onboarding-actions-context'

function initialOnboardingStep(finalStepOnly: boolean, resolvingDeferredPush: boolean) {
  if (finalStepOnly) return ONBOARDING_PRO_STEP
  return resolvingDeferredPush ? ONBOARDING_REMIND_STEP : ONBOARDING_WHAT_STEP
}

function DoneContent({ step, proContent, doneContent }: Readonly<{ step: number; proContent: ReactNode; doneContent: ReactNode }>) {
  return step === ONBOARDING_PRO_STEP ? proContent : doneContent
}

type ReminderDecision = 'idle' | 'allowing' | 'declining'

function FlowActions({ primary, secondary, reason }: Readonly<{ primary: ReactNode; secondary?: ReactNode; reason?: ReactNode }>) {
  return <div className="flex w-full flex-col gap-2"><ActionRow>{secondary}{primary}</ActionRow>{reason}</div>
}

const DONE_TAB_ROUTES: Record<string, string> = { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' }

function DoneShell({ onSelect, children, modalId }: Readonly<{ onSelect: (id: string) => void; children: ReactNode; modalId: string }>) {
  const t = useTranslations()
  const items = useMemo(() => SHELL_DESTINATION_IDS.map((id) => ({ id, label: t(DESTINATION_ICONS[id].labelKey), icon: id })) satisfies ShellWideItem[], [t])
  const tabBar = <BottomTabBar activeId="hoje" label={t('nav.mainNavigation')} items={SHELL_DESTINATION_IDS.map((id) => ({ id, label: t(DESTINATION_ICONS[id].labelKey), icon: ({ active }) => <DestinationIcon destination={id} active={active} color={active ? 'var(--primary)' : 'var(--fg-3)'} /> }))} onSelect={onSelect} />
  return <ShellWide items={items} activeId="hoje" navLabel={t('nav.mainNavigation')} onSelect={onSelect} tabBar={tabBar} notice={<><UpdateAvailableBanner modalId={modalId} /><AppToastHost placement="modal" modalId={modalId} /></>}>
    <div className="mx-auto flex min-h-full w-full max-w-[440px] items-center px-4 lg:max-w-[560px] lg:px-0">{children}</div>
  </ShellWide>
}

interface DecisionProps {
  step: number
  sentence: string
  locale: 'en' | 'pt-BR'
  marks: ReturnType<typeof readHabitPhrase>['consumed']
  isLive: boolean
  emoji: string
  schedule: OnboardingSchedule
  dueTime: string
  proposed: boolean
  correcting: boolean
  atLimit: boolean
  allowance: number
  createFailed: boolean
  creating: boolean
  suggestionPending: boolean
  reminderDecision: ReminderDecision
  reminderState: OnboardingRemindState
  createdTitle: string
  onAccount: () => void
  onSentence: (value: string) => void
  onContinueWhat: () => void
  onCorrect: () => void
  onToggleDay: (day: string) => void
  onTime: (value: string) => void
  onMode: (mode: OnboardingScheduleMode) => void
  onFrequencyUnit: (unit: FrequencyUnit) => void
  onQuantity: (quantity: number) => void
  onIntervalWeeks: (intervalWeeks: number) => void
  onSave: () => void
  onAllow: () => void
  onContinueWithout: () => void
  onEditSchedule: () => void
}

function DecisionContent(props: Readonly<DecisionProps>) {
  if (props.step === ONBOARDING_WHAT_STEP) return <OnboardingWelcome sentence={props.sentence} marks={props.marks} onChange={props.onSentence} />
  if (props.step === ONBOARDING_WHEN_STEP) return <OnboardingCreateHabit title={getHabitPhraseTitle(props.sentence, props.locale)} emoji={props.emoji} schedule={props.schedule} proposed={props.proposed} correcting={props.correcting} canSaveRepeatWeeks={props.isLive} atLimit={props.atLimit} allowance={props.allowance} onCorrect={props.onCorrect} onToggleDay={props.onToggleDay} onTimeChange={props.onTime} onModeChange={props.onMode} onFrequencyUnitChange={props.onFrequencyUnit} onQuantityChange={props.onQuantity} onIntervalWeeksChange={props.onIntervalWeeks} />
  return <OnboardingRemind state={props.reminderState} title={props.createdTitle} dueTime={props.dueTime} isLive={props.isLive} />
}

function DecisionAction(props: Readonly<DecisionProps>) {
  const t = useTranslations('onboarding.flow')
  const decisionPending = props.reminderDecision !== 'idle'
  const allowing = props.reminderDecision === 'allowing'
  const declining = props.reminderDecision === 'declining'
  if (props.step === ONBOARDING_WHAT_STEP) {
    const empty = !props.sentence.trim()
    return <FlowActions primary={<>
      <PillButton disabled={empty} loading={props.suggestionPending} descriptionId={empty ? 'onboarding-continue-reason' : undefined} onClick={props.onContinueWhat}>{t('continue')}</PillButton>
    </>} reason={empty ? <p id="onboarding-continue-reason" className="m-0 text-center text-sm text-[var(--fg-3)]">{t('what.continueReason')}</p> : null} secondary={!props.isLive ? <>
      {/* eslint-disable-next-line local/max-button-words -- The granted onboarding drawing uses this account action label. */}
      <PillButton variant="ghost" onClick={props.onAccount}>{t('what.haveAccount')}</PillButton>
    </> : undefined} />
  }
  if (props.step === ONBOARDING_WHEN_STEP) return <PillButton loading={props.creating} onClick={props.onSave}>{props.createFailed ? t('retry') : t('create')}</PillButton>
  if (props.reminderState === 'ask') return <FlowActions primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('remind.allow')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} onClick={props.onContinueWithout}>{t('remind.deny')}</PillButton>} />
  if (props.reminderState === 'failed') return <FlowActions primary={<PillButton disabled={declining} loading={allowing} onClick={props.onAllow}>{t('retry')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} onClick={props.onContinueWithout}>{t('remind.continue')}</PillButton>} />
  if (props.reminderState === 'no-time' || props.reminderState === 'no-day') return <FlowActions primary={<PillButton loading={declining} onClick={props.onContinueWithout}>{t('remind.continue')}</PillButton>} secondary={<PillButton variant="ghost" disabled={decisionPending} onClick={props.onEditSchedule}>{t(props.reminderState === 'no-day' ? 'remind.setDays' : 'remind.setTime')}</PillButton>} />
  return <PillButton loading={declining} onClick={props.onContinueWithout}>{t('remind.continue')}</PillButton>
}

function OnboardingHeader({ step, onBack, onSkip }: Readonly<{ step: number; onBack?: () => void; onSkip?: () => void }>) {
  const t = useTranslations('onboarding.flow')
  const displayStep = getOnboardingDisplayStep(step)
  return <div className="flex min-h-14 items-center gap-4 px-4 min-[1024px]:px-0">
    <div className="shrink-0"><span className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)] tabular-nums"><span translate="no">Orbit</span> · <span className="text-[var(--fg-1)]">{String(displayStep).padStart(2, '0')}</span> / {String(getOnboardingDisplayTotal()).padStart(2, '0')}</span><span className="sr-only" role="status">{t('step', { current: displayStep, total: getOnboardingDisplayTotal() })}</span></div>
    <ActionRow>
      {onBack && (step === ONBOARDING_WHEN_STEP || step === ONBOARDING_REMIND_STEP) ? <PillButton variant="ghost" size="sm" onClick={onBack}>{t('back')}</PillButton> : null}
      {onSkip ? <PillButton variant="ghost" size="sm" onClick={onSkip}>{t('skip')}</PillButton> : null}
    </ActionRow>
  </div>
}

export function OnboardingFlow({ finalStepOnly = false }: Readonly<{ finalStepOnly?: boolean }>) {
  const t = useTranslations('onboarding.flow')
  const router = useRouter()
  const loginUrl = getOnboardingLoginUrl(useSearchParams().toString())
  const locale = useLocale() === 'pt-BR' ? 'pt-BR' : 'en'
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const deferredPushFailure = useOnboardingDraftStore((state) => isLive && state.pushRegistrationFailed)
  const deferredHabit = useOnboardingDraftStore((state) => deferredPushFailure ? state.habits[0] : undefined)
  const [resolvingDeferredPush] = useState(deferredPushFailure)
  const { profile, refetch: refetchProfile } = useProfile({ enabled: isLive })
  const suggestion = useHabitSuggestion()
  const push = usePushNotificationPreferences()
  const [step, setStep] = useState(initialOnboardingStep(finalStepOnly, resolvingDeferredPush))
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
  const modalId = `modal:${useId()}`
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  useEffect(() => {
    if (!overlayOpen) return
    registerOpenOverlay(modalId)
    return () => unregisterOpenOverlay(modalId)
  }, [modalId, overlayOpen, registerOpenOverlay, unregisterOpenOverlay])
  const suggestionRevision = useRef(0)
  const read = useMemo(() => readHabitPhrase(sentence, locale), [locale, sentence])
  const { dueTime } = schedule
  const allowance = profile?.aiMessagesLimit ?? 5
  const atLimit = isLive && (profile?.aiMessagesUsed ?? 0) >= allowance

  async function continueFromWhat() {
    if (!sentence.trim() || suggestionPending) return
    const localSchedule = clampOnboardingRepeatWeeks(buildOnboardingScheduleFromPhrase(sentence, locale), isLive)
    setEmoji(read.emoji ?? '◎')
    setSchedule(localSchedule)
    setProposed(false)
    setCorrecting(false)
    if (!shouldRequestOnboardingSuggestion({ isLive, atLimit })) {
      setStep(ONBOARDING_WHEN_STEP)
      return
    }
    const revision = suggestionRevision.current + 1
    suggestionRevision.current = revision
    setSuggestionPending(true)
    try {
      const result = await suggestion.mutateAsync({ title: sentence, language: locale })
      if (suggestionRevision.current !== revision) return
      const nextSchedule = buildOnboardingScheduleFromSuggestion(result)
      setEmoji(result.emoji ?? read.emoji ?? '◎')
      setSchedule(nextSchedule)
      setProposed(true)
    } catch {
      if (suggestionRevision.current !== revision) return
      setCorrecting(true)
    } finally {
      if (suggestionRevision.current === revision) {
        setSuggestionPending(false)
        setStep(ONBOARDING_WHEN_STEP)
      }
    }
  }

  function resolveReminderState(): OnboardingRemindState {
    if (schedule.isGeneral) return 'no-day'
    if (!dueTime) return 'no-time'
    if (!push.supported) return 'unsupported'
    return push.permission === 'denied' ? 'refused' : 'ask'
  }

  async function saveHabit() {
    if (creating) return
    const intendedAccountId = getHeldAccountId()
    setCreating(true)
    setCreateFailed(false)
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, reminderEnabled: false, schedule })
    try {
      const accountProfile = isLive ? profile ?? (await refetchProfile()).data : undefined
      if (isLive && !accountProfile) throw new Error('Profile unavailable')
      const accountTimeZone = accountProfile?.timeZone ?? getClientTimeZone()
      if (isLive && accountProfile?.timeZone == null && accountTimeZone && accountTimeZone !== 'UTC') {
        await updateTimezone({ timeZone: accountTimeZone }, intendedAccountId)
      }
      if (createdId) await actions.updateHabit(createdId, { ...input, isGeneral: schedule.isGeneral, isFlexible: schedule.isFlexible })
      else {
        const result = await actions.createHabit(input)
        setCreatedId(result.id)
      }
      setCreatedTitle(input.title)
      setCreatedDueToday(isOnboardingHabitDueToday(schedule, new Date(), accountTimeZone))
      setCreatedGeneral(schedule.isGeneral)
      setReminderState(resolveReminderState())
      setStep(ONBOARDING_REMIND_STEP)
    } catch {
      setCreateFailed(true)
    } finally {
      setCreating(false)
    }
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

  async function setReminderFailure(outcome: OnboardingRemindState) {
    if (await persistReminderDecision(false)) setReminderState(outcome)
  }

  async function allowSignedOutReminders() {
    const outcome = await requestWebPushPermission()
    if (outcome !== 'granted') {
      await setReminderFailure(outcome)
      return
    }
    if (!await persistReminderDecision(true)) return
    actions.deferPushRegistration()
    setStep(ONBOARDING_DONE_STEP)
  }

  async function finishRegisteredReminders() {
    if (resolvingDeferredPush) {
      await finishDeferredPushRecovery()
      return
    }
    if (await persistReminderDecision(true)) setStep(ONBOARDING_DONE_STEP)
  }

  async function allowLiveReminders() {
    const result = await subscribeToPushNotifications()
    if (result.status === 'registered') {
      await finishRegisteredReminders()
      return
    }
    const outcome = !result.supported ? 'unsupported' : result.status === 'denied' ? 'denied' : 'failed'
    await setReminderFailure(outcome)
  }

  async function allowReminders() {
    if (reminderDecision !== 'idle') return
    setReminderDecision('allowing')
    try {
      if (isLive) await allowLiveReminders()
      else await allowSignedOutReminders()
    } catch (error) {
      if (reportsAccountChanged(error)) return
      await setReminderFailure('failed')
    } finally {
      setReminderDecision('idle')
    }
  }

  async function finishDeferredPushRecovery() {
    const generation = getAccountGeneration()
    if (getCurrentPlan(profile) === 'Pro') {
      await actions.finishOnboarding()
      if (getAccountGeneration() === generation) useOnboardingDraftStore.getState().reset()
      return
    }
    const accountId = getHeldAccountId()
    if (accountId !== null) setOnboardingProPending(accountId, true)
    useOnboardingDraftStore.getState().reset()
    setStep(ONBOARDING_PRO_STEP)
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
    } catch (error) {
      if (!reportsAccountChanged(error)) throw error
    } finally {
      setReminderDecision('idle')
    }
  }

  function skip() {
    suggestionRevision.current += 1
    setSuggestionPending(false)
    setSkipped(true)
    setCreatedTitle('')
    setStep(ONBOARDING_DONE_STEP)
  }

  function runStepTransition(transition: () => void) {
    if (step === ONBOARDING_REMIND_STEP && reminderDecision !== 'idle') return
    transition()
  }

  function goBack() {
    runStepTransition(() => setStep(step - 1))
  }

  const decisionProps: DecisionProps = { step, sentence, locale, marks: read.consumed, isLive, emoji, schedule, dueTime, proposed, correcting, atLimit, allowance, createFailed, creating, suggestionPending, reminderDecision, reminderState, createdTitle, onAccount: () => { useOnboardingDraftStore.getState().markOnboardingLocallyDone(); router.push(loginUrl) }, onSentence: (value) => { if (!suggestionPending) setSentence(value) }, onContinueWhat: () => void continueFromWhat(), onCorrect: () => setCorrecting(true), onToggleDay: (day) => setSchedule((current) => toggleOnboardingScheduleDay(current, day)), onTime: (value) => setSchedule((current) => ({ ...current, dueTime: value })), onMode: (mode) => setSchedule((current) => changeOnboardingScheduleMode(current, mode)), onFrequencyUnit: (frequencyUnit) => setSchedule((current) => ({ ...current, frequencyUnit, days: [], isGeneral: false })), onQuantity: (frequencyQuantity) => setSchedule((current) => ({ ...current, frequencyQuantity })), onIntervalWeeks: (intervalWeeks) => setSchedule((current) => ({ ...current, intervalWeeks })), onSave: () => void saveHabit(), onAllow: () => void allowReminders(), onContinueWithout: () => void continueWithoutReminders(), onEditSchedule: () => runStepTransition(() => setStep(ONBOARDING_WHEN_STEP)) }

  /** The one exit for the done button, the done tab bar and Escape. */
  async function finishAndLeave(destination = destinationAfterPro) {
    const accountId = getHeldAccountId()
    const generation = getAccountGeneration()
    try {
      await actions.finishOnboarding()
    } catch (error) {
      if (reportsAccountChanged(error) && step !== ONBOARDING_PRO_STEP) return
      throw error
    }
    if (getAccountGeneration() !== generation) return
    if (resolvingDeferredPush) useOnboardingDraftStore.getState().reset()
    if (accountId !== null) setOnboardingProPending(accountId, false)
    setOverlayOpen(false)
    if (destination) router.push(destination)
  }

  function completeAndLeave(destination?: string) {
    if (step === ONBOARDING_PRO_STEP) { proStepRef.current?.exit(destination); return }
    if (isLive && step < ONBOARDING_DONE_STEP && getCurrentPlan(profile) !== 'Pro') { skip(); return }
    if (isLive && step === ONBOARDING_DONE_STEP && getCurrentPlan(profile) !== 'Pro') { setDestinationAfterPro(destination); setStep(ONBOARDING_PRO_STEP); return }
    void finishAndLeave(destination)
  }

  function closeOverlay() {
    runStepTransition(() => void completeAndLeave())
  }

  const overlay = step >= ONBOARDING_DONE_STEP ? (
    <DoneShell modalId={modalId} onSelect={(id) => completeAndLeave(isLive ? DONE_TAB_ROUTES[id] : undefined)}><DoneContent step={step} proContent={<OnboardingProStep ref={proStepRef} onFinish={finishAndLeave} />} doneContent={<OnboardingComplete createdHabit={createdTitle} emoji={emoji} remindersOff={remindersOff} skipped={skipped} signedOut={!isLive} continuesToPro={isLive && getCurrentPlan(profile) !== 'Pro'} dueToday={createdDueToday} general={createdGeneral} onFinish={() => completeAndLeave()} />} /></DoneShell>
  ) : (
    <FlowShell nav={false} mode="onboarding" header={<OnboardingHeader step={step} onBack={resolvingDeferredPush ? undefined : goBack} onSkip={createdId ? undefined : skip} />} action={<DecisionAction {...decisionProps} />} notice={<><UpdateAvailableBanner modalId={modalId} />{createFailed ? <Toast kind="neutral" message={t('createFailed')} /> : null}<AppToastHost placement="modal" modalId={modalId} /></>}><DecisionContent {...decisionProps} /></FlowShell>
  )
  return <Dialog.Root open={overlayOpen} modal disablePointerDismissal onOpenChange={(open) => { if (!open) closeOverlay() }}><Dialog.Portal><Dialog.Viewport className="z-modal fixed inset-0"><Dialog.Popup aria-labelledby="onboarding-title" className="fixed inset-0 overflow-hidden bg-[var(--bg)] pt-[var(--safe-top)] [&_[data-shell=wide]]:h-full [&_[data-shell=wide]]:min-h-0 [&_[data-shell-column]]:h-full [&_[data-shell-column]]:pt-0 lg:[&_[data-shell-column]]:pt-8 [&_[data-shell-sidebar]]:h-full">{overlay}</Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>
}
